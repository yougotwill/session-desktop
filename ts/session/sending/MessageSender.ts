// REMOVE COMMENT AFTER: This can just export pure functions as it doesn't need state

import { AbortController } from 'abort-controller';
import ByteBuffer from 'bytebuffer';
import { GroupPubkeyType, PubkeyType } from 'libsession_util_nodejs';
import { from_hex } from 'libsodium-wrappers-sumo';
import { compact, isEmpty, isNumber, isString, sample } from 'lodash';
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
  RevokeSubaccountParams,
  RevokeSubaccountSubRequest,
  StoreOnNodeData,
  StoreOnNodeParams,
  StoreOnNodeParamsNoSig,
  UnrevokeSubaccountParams,
  UnrevokeSubaccountSubRequest,
} from '../apis/snode_api/SnodeRequestTypes';
import { GetNetworkTime } from '../apis/snode_api/getNetworkTime';
import { SnodeNamespace, SnodeNamespaces } from '../apis/snode_api/namespaces';
import {
  SigResultAdmin,
  SigResultSubAccount,
  SnodeGroupSignature,
} from '../apis/snode_api/signature/groupSignature';
import { SnodeSignature, SnodeSignatureResult } from '../apis/snode_api/signature/snodeSignatures';
import { getSwarmFor } from '../apis/snode_api/snodePool';
import { SnodeAPIStore } from '../apis/snode_api/storeMessage';
import { WithMessagesHashes, WithRevokeParams } from '../apis/snode_api/types';
import { TTL_DEFAULT } from '../constants';
import { ConvoHub } from '../conversations';
import { MessageEncrypter, concatUInt8Array } from '../crypto';
import { addMessagePadding } from '../crypto/BufferPadding';
import { ContentMessage } from '../messages/outgoing';
import { UnsendMessage } from '../messages/outgoing/controlMessage/UnsendMessage';
import { ClosedGroupNewMessage } from '../messages/outgoing/controlMessage/group/ClosedGroupNewMessage';
import { OpenGroupVisibleMessage } from '../messages/outgoing/visibleMessage/OpenGroupVisibleMessage';
import { ed25519Str } from '../onions/onionPath';
import { PubKey } from '../types';
import { OutgoingRawMessage } from '../types/RawMessage';
import { StringUtils, UserUtils } from '../utils';
import { fromUInt8ArrayToBase64 } from '../utils/String';
import { EmptySwarmError } from '../utils/errors';

// ================ SNODE STORE ================

function getMinRetryTimeout() {
  return 1000;
}

function isContentSyncMessage(message: ContentMessage) {
  if (
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

async function send({
  message,
  retryMinTimeout = 100,
  attempts = 3,
  isSyncMessage,
}: {
  message: OutgoingRawMessage;
  attempts?: number;
  retryMinTimeout?: number; // in ms
  isSyncMessage: boolean;
}): Promise<{ wrappedEnvelope: Uint8Array; effectiveTimestamp: number }> {
  const destination = message.device;
  if (!PubKey.is03Pubkey(destination) && !PubKey.is05Pubkey(destination)) {
    throw new Error('MessageSender rawMessage was given invalid pubkey');
  }
  return pRetry(
    async () => {
      const recipient = PubKey.cast(message.device);

      // we can only have a single message in this send function for now
      const [encryptedAndWrapped] = await encryptMessagesAndWrap([
        {
          destination: message.device,
          plainTextBuffer: message.plainTextBuffer,
          namespace: message.namespace,
          ttl: message.ttl,
          identifier: message.identifier,
          networkTimestamp: message.networkTimestampCreated,
          isSyncMessage: Boolean(isSyncMessage),
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
      let foundMessage = encryptedAndWrapped.identifier
        ? await Data.getMessageById(encryptedAndWrapped.identifier)
        : null;

      const isSyncedDeleteAfterReadMessage =
        found &&
        UserUtils.isUsFromCache(recipient.key) &&
        found.getExpirationType() === 'deleteAfterRead' &&
        found.getExpireTimerSeconds() > 0 &&
        encryptedAndWrapped.isSyncMessage;

      let overridenTtl = encryptedAndWrapped.ttl;
      if (isSyncedDeleteAfterReadMessage && found.getExpireTimerSeconds() > 0) {
        const asMs = found.getExpireTimerSeconds() * 1000;
        window.log.debug(`overriding ttl for synced DaR message to ${asMs}`);
        overridenTtl = asMs;
      }

      const batchResult = await MessageSender.sendMessagesDataToSnode(
        [
          {
            pubkey: destination,
            data64: encryptedAndWrapped.data64,
            ttl: overridenTtl,
            timestamp: encryptedAndWrapped.networkTimestamp,
            namespace: encryptedAndWrapped.namespace,
          },
        ],
        destination,
        { messagesHashes: [], revokeParams: null, unrevokeParams: null },
        'batch'
      );

      const isDestinationClosedGroup = ConvoHub.use().get(recipient.key)?.isClosedGroup();
      const storedAt = batchResult?.[0]?.body?.t;
      const storedHash = batchResult?.[0]?.body?.hash;

      if (
        batchResult &&
        !isEmpty(batchResult) &&
        batchResult[0].code === 200 &&
        !isEmpty(storedHash) &&
        isString(storedHash) &&
        isNumber(storedAt)
      ) {
        // TODO: the expiration is due to be returned by the storage server on "store" soon, we will then be able to use it instead of doing the storedAt + ttl logic below
        // if we have a hash and a storedAt, mark it as seen so we don't reprocess it on the next retrieve
        await Data.saveSeenMessageHashes([
          {
            expiresAt: encryptedAndWrapped.networkTimestamp + TTL_DEFAULT.CONTENT_MESSAGE, // non config msg expire at TTL_MAX at most
            hash: storedHash,
          },
        ]);
        // If message also has a sync message, save that hash. Otherwise save the hash from the regular message send i.e. only closed groups in this case.

        if (
          encryptedAndWrapped.identifier &&
          (encryptedAndWrapped.isSyncMessage || isDestinationClosedGroup)
        ) {
          // get a fresh copy of the message from the DB
          foundMessage = await Data.getMessageById(encryptedAndWrapped.identifier);
          if (foundMessage) {
            await foundMessage.updateMessageHash(storedHash);
            await foundMessage.commit();
            window?.log?.info(
              `updated message ${foundMessage.get('id')} with hash: ${foundMessage.get(
                'messageHash'
              )}`
            );
          }
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

async function getSignatureParamsFromNamespace(
  item: StoreOnNodeParamsNoSig,
  destination: string
): Promise<SigResultSubAccount | SigResultAdmin | SnodeSignatureResult | object> {
  const store = 'store' as const;
  if (SnodeNamespace.isUserConfigNamespace(item.namespace)) {
    const ourPrivKey = (await UserUtils.getUserED25519KeyPairBytes())?.privKeyBytes;
    if (!ourPrivKey) {
      throw new Error(
        'getSignatureParamsFromNamespace UserUtils.getUserED25519KeyPairBytes is empty'
      );
    }
    return SnodeSignature.getSnodeSignatureParamsUs({
      method: store,
      namespace: item.namespace,
    });
  }

  if (
    SnodeNamespace.isGroupConfigNamespace(item.namespace) ||
    item.namespace === SnodeNamespaces.ClosedGroupMessages ||
    item.namespace === SnodeNamespaces.ClosedGroupRevokedRetrievableMessages
  ) {
    if (!PubKey.is03Pubkey(destination)) {
      throw new Error(
        'getSignatureParamsFromNamespace: groupconfig namespace required a 03 pubkey'
      );
    }
    const found = await UserGroupsWrapperActions.getGroup(destination);
    return SnodeGroupSignature.getSnodeGroupSignature({
      method: store,
      namespace: item.namespace,
      group: found,
    });
  }
  // no signature required for this namespace/pubkey combo
  return {};
}

async function signDeleteHashesRequest(
  destination: PubkeyType | GroupPubkeyType,
  messagesHashes: Array<string>
) {
  if (isEmpty(messagesHashes)) {
    return null;
  }
  const signedRequest = messagesHashes
    ? PubKey.is03Pubkey(destination)
      ? await SnodeGroupSignature.getGroupSignatureByHashesParams({
          messagesHashes,
          pubkey: destination,
          method: 'delete',
        })
      : await SnodeSignature.getSnodeSignatureByHashesParams({
          messagesHashes,
          pubkey: destination,
          method: 'delete',
        })
    : null;

  return signedRequest || null;
}

async function signedRevokeRequest({
  destination,
  revokeParams,
  unrevokeParams,
}: WithRevokeParams & { destination: PubkeyType | GroupPubkeyType }) {
  let revokeSignedRequest: RevokeSubaccountSubRequest | null = null;
  let unrevokeSignedRequest: UnrevokeSubaccountSubRequest | null = null;

  if (!PubKey.is03Pubkey(destination) || (isEmpty(revokeParams) && isEmpty(unrevokeParams))) {
    return { revokeSignedRequest, unrevokeSignedRequest };
  }

  const group = await UserGroupsWrapperActions.getGroup(destination);
  const secretKey = group?.secretKey;
  if (!secretKey || isEmpty(secretKey)) {
    throw new Error('tried to signedRevokeRequest but we do not have the admin secret key');
  }

  const timestamp = GetNetworkTime.now();

  if (revokeParams) {
    const method = 'revoke_subaccount' as const;
    const tokensBytes = from_hex(revokeParams.revoke.join(''));

    const prefix = new Uint8Array(StringUtils.encode(`${method}${timestamp}`, 'utf8'));
    const sigResult = await SnodeGroupSignature.signDataWithAdminSecret(
      concatUInt8Array(prefix, tokensBytes),
      { secretKey }
    );

    revokeSignedRequest = {
      method,
      params: {
        revoke: revokeParams.revoke,
        ...sigResult,
        pubkey: destination,
        timestamp,
      },
    };
  }
  if (unrevokeParams) {
    const method = 'unrevoke_subaccount' as const;
    const tokensBytes = from_hex(unrevokeParams.unrevoke.join(''));

    const prefix = new Uint8Array(StringUtils.encode(`${method}${timestamp}`, 'utf8'));
    const sigResult = await SnodeGroupSignature.signDataWithAdminSecret(
      concatUInt8Array(prefix, tokensBytes),
      { secretKey }
    );

    unrevokeSignedRequest = {
      method,
      params: {
        unrevoke: unrevokeParams.unrevoke,
        ...sigResult,
        pubkey: destination,
        timestamp,
      },
    };
  }

  return { revokeSignedRequest, unrevokeSignedRequest };
}

async function sendMessagesDataToSnode(
  params: Array<StoreOnNodeParamsNoSig>,
  destination: PubkeyType | GroupPubkeyType,
  {
    messagesHashes: messagesToDelete,
    revokeParams,
    unrevokeParams,
  }: WithMessagesHashes & WithRevokeParams,
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

  const snode = sample(swarm);
  if (!snode) {
    throw new EmptySwarmError(destination, 'Ran out of swarm nodes to query');
  }

  const signedDeleteHashesRequest = await signDeleteHashesRequest(destination, messagesToDelete);
  const signedRevokeRequests = await signedRevokeRequest({
    destination,
    revokeParams,
    unrevokeParams,
  });

  try {
    // No pRetry here as if this is a bad path it will be handled and retried in lokiOnionFetch.
    const storeResults = await SnodeAPIStore.batchStoreOnNode(
      snode,
      compact([
        ...withSigWhenRequired,
        signedDeleteHashesRequest,
        signedRevokeRequests?.revokeSignedRequest,
        signedRevokeRequests?.unrevokeSignedRequest,
      ]),

      method
    );

    if (!isEmpty(storeResults)) {
      window?.log?.info(
        `sendMessagesDataToSnode - Successfully stored messages to ${ed25519Str(destination)} via ${
          snode.ip
        }:${snode.port} on namespaces: ${SnodeNamespace.toRoles(
          rightDestination.map(m => m.namespace)
        ).join(',')}`
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
  networkTimestamp: number;
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
    networkTimestamp,
  } = params;

  const envelope = await wrapContentIntoEnvelope(
    SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE,
    destination,
    networkTimestamp,
    plainTextBuffer
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
    networkTimestamp,
  } = params;

  if (PubKey.is03Pubkey(destination)) {
    return encryptForGroupV2(params);
  }

  // can only be legacy group or 1o1 chats here

  const recipient = PubKey.cast(destination);

  const { envelopeType, cipherText } = await MessageEncrypter.encrypt(
    recipient,
    plainTextBuffer,
    encryptionBasedOnConversation(recipient)
  );

  const envelope = await wrapContentIntoEnvelope(
    envelopeType,
    recipient.key,
    networkTimestamp,
    cipherText
  );
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
async function sendEncryptedDataToSnode({
  destination,
  encryptedData,
  messagesHashesToDelete,
  revokeParams,
  unrevokeParams,
}: {
  encryptedData: Array<StoreOnNodeData>;
  destination: GroupPubkeyType | PubkeyType;
  messagesHashesToDelete: Set<string> | null;
  revokeParams: RevokeSubaccountParams | null;
  unrevokeParams: UnrevokeSubaccountParams | null;
}): Promise<NotEmptyArrayOfBatchResults | null> {
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
          { messagesHashes: [...(messagesHashesToDelete || [])], revokeParams, unrevokeParams },
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

async function wrapContentIntoEnvelope(
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
    sentTimestamp: GetNetworkTime.now(),
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
    sentTimestamp: GetNetworkTime.now(),
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
  isContentSyncMessage,
  wrapContentIntoEnvelope,
};
