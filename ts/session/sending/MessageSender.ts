// REMOVE COMMENT AFTER: This can just export pure functions as it doesn't need state

import { AbortController } from 'abort-controller';
import ByteBuffer from 'bytebuffer';
import { GroupPubkeyType, PubkeyType } from 'libsession_util_nodejs';
import _, { isEmpty, isNil, sample, toNumber } from 'lodash';
import pRetry from 'p-retry';
import { Data } from '../../data/data';
import { SignalService } from '../../protobuf';
import { UserGroupsWrapperActions } from '../../webworker/workers/browser/libsession_worker_interface';
import { OpenGroupRequestCommonType } from '../apis/open_group_api/opengroupV2/ApiUtil';
import { OpenGroupMessageV2 } from '../apis/open_group_api/opengroupV2/OpenGroupMessageV2';
import {
  sendMessageOnionV4BlindedRequest,
  sendSogsMessageOnionV4,
} from '../apis/open_group_api/sogsv3/sogsV3SendMessage';
import {
  NotEmptyArrayOfBatchResults,
  StoreOnNodeData,
  StoreOnNodeParams,
  StoreOnNodeParamsNoSig,
} from '../apis/snode_api/SnodeRequestTypes';
import { GetNetworkTime } from '../apis/snode_api/getNetworkTime';
import { SnodeNamespace, SnodeNamespaces } from '../apis/snode_api/namespaces';
import { getSwarmFor } from '../apis/snode_api/snodePool';
import { SnodeSignature } from '../apis/snode_api/snodeSignatures';
import { SnodeAPIStore } from '../apis/snode_api/storeMessage';
import { ConvoHub } from '../conversations';
import { MessageEncrypter } from '../crypto';
import { addMessagePadding } from '../crypto/BufferPadding';
import { ContentMessage } from '../messages/outgoing';
import { ConfigurationMessage } from '../messages/outgoing/controlMessage/ConfigurationMessage';
import { UnsendMessage } from '../messages/outgoing/controlMessage/UnsendMessage';
import { ClosedGroupNewMessage } from '../messages/outgoing/controlMessage/group/ClosedGroupNewMessage';
import { OpenGroupVisibleMessage } from '../messages/outgoing/visibleMessage/OpenGroupVisibleMessage';
import { ed25519Str } from '../onions/onionPath';
import { PubKey } from '../types';
import { RawMessage } from '../types/RawMessage';
import { UserUtils } from '../utils';
import { fromUInt8ArrayToBase64 } from '../utils/String';
import { EmptySwarmError } from '../utils/errors';

// ================ SNODE STORE ================

function overwriteOutgoingTimestampWithNetworkTimestamp(message: { plainTextBuffer: Uint8Array }) {
  const networkTimestamp = GetNetworkTime.getNowWithNetworkOffset();

  const { plainTextBuffer } = message;
  const contentDecoded = SignalService.Content.decode(plainTextBuffer);

  const { dataMessage, dataExtractionNotification, typingMessage } = contentDecoded;
  if (dataMessage && dataMessage.timestamp && toNumber(dataMessage.timestamp) > 0) {
    // this is a sync message, do not overwrite the message timestamp
    if (dataMessage.syncTarget) {
      return {
        overRiddenTimestampBuffer: plainTextBuffer,
        networkTimestamp: _.toNumber(dataMessage.timestamp),
      };
    }
    dataMessage.timestamp = networkTimestamp;
  }
  if (
    dataExtractionNotification &&
    dataExtractionNotification.timestamp &&
    toNumber(dataExtractionNotification.timestamp) > 0
  ) {
    dataExtractionNotification.timestamp = networkTimestamp;
  }
  if (typingMessage && typingMessage.timestamp && toNumber(typingMessage.timestamp) > 0) {
    typingMessage.timestamp = networkTimestamp;
  }
  const overRiddenTimestampBuffer = SignalService.Content.encode(contentDecoded).finish();
  return { overRiddenTimestampBuffer, networkTimestamp };
}

function getMinRetryTimeout() {
  return 1000;
}

function isSyncMessage(message: ContentMessage) {
  if (
    message instanceof ConfigurationMessage ||
    message instanceof ClosedGroupNewMessage ||
    message instanceof UnsendMessage ||
    (message as any).syncTarget?.length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Send a single message via service nodes.
 *
 * @param message The message to send.
 * @param attempts The amount of times to attempt sending. Minimum value is 1.
 */
async function send(
  message: RawMessage,
  attempts: number = 3,
  retryMinTimeout?: number, // in ms
  isASyncMessage?: boolean
): Promise<{ wrappedEnvelope: Uint8Array; effectiveTimestamp: number }> {
  return pRetry(
    async () => {
      const recipient = PubKey.cast(message.device);
      const { ttl } = message;

      // we can only have a single message in this send function for now
      const [encryptedAndWrapped] = await encryptMessagesAndWrap([
        {
          destination: message.device,
          plainTextBuffer: message.plainTextBuffer,
          namespace: message.namespace,
          ttl,
          identifier: message.identifier,
          isSyncMessage: Boolean(isASyncMessage),
        },
      ]);

      // make sure to update the local sent_at timestamp, because sometimes, we will get the just pushed message in the receiver side
      // before we return from the await below.
      // and the isDuplicate messages relies on sent_at timestamp to be valid.
      const found = await Data.getMessageById(encryptedAndWrapped.identifier);
      // make sure to not update the sent timestamp if this a currently syncing message
      if (found && !found.get('sentSync')) {
        found.set({ sent_at: encryptedAndWrapped.networkTimestamp });
        await found.commit();
      }

      const batchResult = await MessageSender.sendMessagesDataToSnode(
        [
          {
            pubkey: recipient.key,
            data64: encryptedAndWrapped.data64,
            ttl,
            timestamp: encryptedAndWrapped.networkTimestamp,
            namespace: encryptedAndWrapped.namespace,
          },
        ],
        recipient.key,
        null,
        'batch'
      );

      const isDestinationClosedGroup = ConvoHub.use().get(recipient.key)?.isClosedGroup();
      // If message also has a sync message, save that hash. Otherwise save the hash from the regular message send i.e. only closed groups in this case.
      if (
        encryptedAndWrapped.identifier &&
        (encryptedAndWrapped.isSyncMessage || isDestinationClosedGroup) &&
        batchResult &&
        !isEmpty(batchResult) &&
        batchResult[0].code === 200 &&
        !isEmpty(batchResult[0].body.hash)
      ) {
        const messageSendHash = batchResult[0].body.hash;
        const foundMessage = await Data.getMessageById(encryptedAndWrapped.identifier);
        if (foundMessage) {
          await foundMessage.updateMessageHash(messageSendHash);
          await foundMessage.commit();
          window?.log?.info(
            `updated message ${foundMessage.get('id')} with hash: ${foundMessage.get(
              'messageHash'
            )}`
          );
        }
      }

      return {
        wrappedEnvelope: encryptedAndWrapped.data,
        effectiveTimestamp: encryptedAndWrapped.networkTimestamp,
      };
    },
    {
      retries: Math.max(attempts - 1, 0),
      factor: 1,
      minTimeout: retryMinTimeout || MessageSender.getMinRetryTimeout(),
    }
  );
}

async function getSignatureParamsFromNamespace(item: StoreOnNodeParamsNoSig, destination: string) {
  if (SnodeNamespace.isUserConfigNamespace(item.namespace)) {
    const ourPrivKey = (await UserUtils.getUserED25519KeyPairBytes())?.privKeyBytes;
    if (!ourPrivKey) {
      throw new Error('sendMessagesDataToSnode UserUtils.getUserED25519KeyPairBytes is empty');
    }
    return SnodeSignature.getSnodeSignatureParamsUs({
      method: 'store' as const,
      namespace: item.namespace,
    });
  }

  if (
    SnodeNamespace.isGroupConfigNamespace(item.namespace) ||
    item.namespace === SnodeNamespaces.ClosedGroupMessages
  ) {
    if (!PubKey.isClosedGroupV2(destination)) {
      throw new Error('sendMessagesDataToSnode: groupconfig namespace required a 03 pubkey');
    }
    const group = await UserGroupsWrapperActions.getGroup(destination);
    const groupSecretKey = group?.secretKey; // TODO we will need to the user auth at some point
    if (isNil(groupSecretKey) || isEmpty(groupSecretKey)) {
      throw new Error(`sendMessagesDataToSnode: failed to find group admin secret key in wrapper`);
    }
    return SnodeSignature.getSnodeGroupSignatureParams({
      method: 'store' as const,
      namespace: item.namespace,
      groupPk: destination,
      groupIdentityPrivKey: groupSecretKey,
    });
  }
  return {};
}

async function sendMessagesDataToSnode(
  params: Array<StoreOnNodeParamsNoSig>,
  destination: string,
  messagesHashesToDelete: Set<string> | null,
  method: 'batch' | 'sequence'
): Promise<NotEmptyArrayOfBatchResults> {
  const rightDestination = params.filter(m => m.pubkey === destination);

  const swarm = await getSwarmFor(destination);

  const withSigWhenRequired: Array<StoreOnNodeParams> = await Promise.all(
    rightDestination.map(async item => {
      // some namespaces require a signature to be added
      const signOpts = await getSignatureParamsFromNamespace(item, destination);

      const store: StoreOnNodeParams = {
        data: item.data64,
        namespace: item.namespace,
        pubkey: item.pubkey,
        timestamp: item.timestamp, // sig_timestamp is unused and uneeded
        ttl: item.ttl,
        ...signOpts,
      };
      return store;
    })
  );

  const signedDeleteOldHashesRequest =
    messagesHashesToDelete && messagesHashesToDelete.size
      ? await SnodeSignature.getSnodeSignatureByHashesParams({
          method: 'delete' as const,
          messagesHashes: [...messagesHashesToDelete],
          pubkey: destination,
        })
      : null;

  const snode = sample(swarm);
  if (!snode) {
    throw new EmptySwarmError(destination, 'Ran out of swarm nodes to query');
  }

  try {
    // No pRetry here as if this is a bad path it will be handled and retried in lokiOnionFetch.
    const storeResults = await SnodeAPIStore.storeOnNode(
      snode,
      withSigWhenRequired,
      signedDeleteOldHashesRequest,
      method
    );

    if (!isEmpty(storeResults)) {
      window?.log?.info(
        `sendMessagesDataToSnode - Successfully stored messages to ${ed25519Str(destination)} via ${
          snode.ip
        }:${snode.port} on namespaces: ${rightDestination.map(m => m.namespace).join(',')}`
      );
    }

    return storeResults;
  } catch (e) {
    const snodeStr = snode ? `${snode.ip}:${snode.port}` : 'null';
    window?.log?.warn(
      `sendMessagesDataToSnode - "${e.code}:${e.message}" to ${destination} via snode:${snodeStr}`
    );
    throw e;
  }
}

function encryptionBasedOnConversation(destination: PubKey) {
  if (ConvoHub.use().get(destination.key)?.isClosedGroup()) {
    return SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE;
  }
  return SignalService.Envelope.Type.SESSION_MESSAGE;
}

type SharedEncryptAndWrap = {
  ttl: number;
  identifier: string;
  isSyncMessage: boolean;
};

type EncryptAndWrapMessage = {
  plainTextBuffer: Uint8Array;
  destination: string;
  namespace: number;
} & SharedEncryptAndWrap;

type EncryptAndWrapMessageResults = {
  data64: string;
  networkTimestamp: number;
  data: Uint8Array;
  namespace: number;
} & SharedEncryptAndWrap;

async function encryptForGroupV2(
  params: EncryptAndWrapMessage
): Promise<EncryptAndWrapMessageResults> {
  // Group v2 encryption works a bit differently: we encrypt the envelope itself through libsession.
  // We essentially need to do the opposite of the usual encryption which is send envelope unencrypted with content encrypted.
  const {
    destination,
    identifier,
    isSyncMessage: syncMessage,
    namespace,
    plainTextBuffer,
    ttl,
  } = params;

  const { overRiddenTimestampBuffer, networkTimestamp } =
    overwriteOutgoingTimestampWithNetworkTimestamp({ plainTextBuffer });
  const envelope = await buildEnvelope(
    SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE,
    destination,
    networkTimestamp,
    overRiddenTimestampBuffer
  );

  const recipient = PubKey.cast(destination);

  const { cipherText } = await MessageEncrypter.encrypt(
    recipient,
    SignalService.Envelope.encode(envelope).finish(),
    encryptionBasedOnConversation(recipient)
  );

  const data64 = ByteBuffer.wrap(cipherText).toString('base64');

  return {
    data64,
    networkTimestamp,
    data: cipherText,
    namespace,
    ttl,
    identifier,
    isSyncMessage: syncMessage,
  };
}

async function encryptMessageAndWrap(
  params: EncryptAndWrapMessage
): Promise<EncryptAndWrapMessageResults> {
  const {
    destination,
    identifier,
    isSyncMessage: syncMessage,
    namespace,
    plainTextBuffer,
    ttl,
  } = params;

  if (PubKey.isClosedGroupV2(destination)) {
    return encryptForGroupV2(params);
  }

  const { overRiddenTimestampBuffer, networkTimestamp } =
    overwriteOutgoingTimestampWithNetworkTimestamp({ plainTextBuffer });
  const recipient = PubKey.cast(destination);

  const { envelopeType, cipherText } = await MessageEncrypter.encrypt(
    recipient,
    overRiddenTimestampBuffer,
    encryptionBasedOnConversation(recipient)
  );

  const envelope = await buildEnvelope(envelopeType, recipient.key, networkTimestamp, cipherText);
  const data = wrapEnvelopeInWebSocketMessage(envelope);
  const data64 = ByteBuffer.wrap(data).toString('base64');

  return {
    data64,
    networkTimestamp,
    data,
    namespace,
    ttl,
    identifier,
    isSyncMessage: syncMessage,
  };
}

async function encryptMessagesAndWrap(
  messages: Array<EncryptAndWrapMessage>
): Promise<Array<EncryptAndWrapMessageResults>> {
  return Promise.all(messages.map(encryptMessageAndWrap));
}

/**
 * Send an array of preencrypted data to the corresponding swarm.
 * Used currently only for sending libsession GroupInfo, GroupMembers and groupKeys config updates.
 *
 * @param params the data to deposit
 * @param destination the pubkey we should deposit those message to
 * @returns the hashes of successful deposit
 */
async function sendEncryptedDataToSnode(
  encryptedData: Array<StoreOnNodeData>,
  destination: GroupPubkeyType | PubkeyType,
  messagesHashesToDelete: Set<string> | null
): Promise<NotEmptyArrayOfBatchResults | null> {
  try {
    const batchResults = await pRetry(
      async () => {
        return MessageSender.sendMessagesDataToSnode(
          encryptedData.map(content => ({
            pubkey: destination,
            data64: ByteBuffer.wrap(content.data).toString('base64'),
            ttl: content.ttl,
            timestamp: content.networkTimestamp,
            namespace: content.namespace,
          })),
          destination,
          messagesHashesToDelete,
          'sequence'
        );
      },
      {
        retries: 2,
        factor: 1,
        minTimeout: MessageSender.getMinRetryTimeout(),
        maxTimeout: 1000,
      }
    );

    if (!batchResults || isEmpty(batchResults)) {
      throw new Error('result is empty for sendEncryptedDataToSnode');
    }

    return batchResults;
  } catch (e) {
    window.log.warn(`sendEncryptedDataToSnode failed with ${e.message}`);
    return null;
  }
}

async function buildEnvelope(
  type: SignalService.Envelope.Type,
  sskSource: string | undefined,
  timestamp: number,
  content: Uint8Array
): Promise<SignalService.Envelope> {
  let source: string | undefined;

  if (type === SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE) {
    source = sskSource;
  }

  return SignalService.Envelope.create({
    type,
    source,
    timestamp,
    content,
  });
}

/**
 * This is an outdated practice and we should probably just send the envelope data directly.
 * Something to think about in the future.
 */
function wrapEnvelopeInWebSocketMessage(envelope: SignalService.Envelope): Uint8Array {
  const request = SignalService.WebSocketRequestMessage.create({
    id: 0,
    body: SignalService.Envelope.encode(envelope).finish(),
    verb: 'PUT',
    path: '/api/v1/message',
  });

  const websocket = SignalService.WebSocketMessage.create({
    type: SignalService.WebSocketMessage.Type.REQUEST,
    request,
  });
  return SignalService.WebSocketMessage.encode(websocket).finish();
}

// ================ Open Group ================
/**
 * Send a message to an open group v2.
 * @param message The open group message.
 */
async function sendToOpenGroupV2(
  rawMessage: OpenGroupVisibleMessage,
  roomInfos: OpenGroupRequestCommonType,
  blinded: boolean,
  filesToLink: Array<number>
): Promise<OpenGroupMessageV2 | boolean> {
  // we agreed to pad message for opengroupv2
  const paddedBody = addMessagePadding(rawMessage.plainTextBuffer());
  const v2Message = new OpenGroupMessageV2({
    sentTimestamp: GetNetworkTime.getNowWithNetworkOffset(),
    base64EncodedData: fromUInt8ArrayToBase64(paddedBody),
    filesToLink,
  });

  const msg = await sendSogsMessageOnionV4(
    roomInfos.serverUrl,
    roomInfos.roomId,
    new AbortController().signal,
    v2Message,
    blinded
  );
  return msg;
}

/**
 * Send a message to an open group v2.
 * @param message The open group message.
 */
async function sendToOpenGroupV2BlindedRequest(
  encryptedContent: Uint8Array,
  roomInfos: OpenGroupRequestCommonType,
  recipientBlindedId: string
): Promise<{ serverId: number; serverTimestamp: number }> {
  const v2Message = new OpenGroupMessageV2({
    sentTimestamp: GetNetworkTime.getNowWithNetworkOffset(),
    base64EncodedData: fromUInt8ArrayToBase64(encryptedContent),
  });

  // Warning: sendMessageOnionV4BlindedRequest throws
  const msg = await sendMessageOnionV4BlindedRequest(
    roomInfos.serverUrl,
    roomInfos.roomId,
    new AbortController().signal,
    v2Message,
    recipientBlindedId
  );
  return msg;
}

export const MessageSender = {
  sendToOpenGroupV2BlindedRequest,
  sendMessagesDataToSnode,
  sendEncryptedDataToSnode,
  getMinRetryTimeout,
  sendToOpenGroupV2,
  send,
  isSyncMessage,
};
