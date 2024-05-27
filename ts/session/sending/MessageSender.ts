// REMOVE COMMENT AFTER: This can just export pure functions as it doesn't need state

import { AbortController } from 'abort-controller';
import { GroupPubkeyType, PubkeyType } from 'libsession_util_nodejs';
import { compact, isArray, isEmpty, isNumber, isString } from 'lodash';
import pRetry from 'p-retry';
import { Data, SeenMessageHashes } from '../../data/data';
import { SignalService } from '../../protobuf';
import { assertUnreachable } from '../../types/sqlSharedTypes';
import { UserGroupsWrapperActions } from '../../webworker/workers/browser/libsession_worker_interface';
import { OpenGroupRequestCommonType } from '../apis/open_group_api/opengroupV2/ApiUtil';
import { OpenGroupMessageV2 } from '../apis/open_group_api/opengroupV2/OpenGroupMessageV2';
import {
  sendMessageOnionV4BlindedRequest,
  sendSogsMessageOnionV4,
} from '../apis/open_group_api/sogsv3/sogsV3SendMessage';
import {
  BuiltSnodeSubRequests,
  DeleteAllFromUserNodeSubRequest,
  DeleteHashesFromGroupNodeSubRequest,
  DeleteHashesFromUserNodeSubRequest,
  GetExpiriesFromNodeSubRequest,
  GetServiceNodesSubRequest,
  MethodBatchType,
  NetworkTimeSubRequest,
  NotEmptyArrayOfBatchResults,
  OnsResolveSubRequest,
  RawSnodeSubRequests,
  RetrieveGroupSubRequest,
  RetrieveLegacyClosedGroupSubRequest,
  RetrieveUserSubRequest,
  StoreGroupConfigOrMessageSubRequest,
  StoreLegacyGroupMessageSubRequest,
  StoreUserConfigSubRequest,
  StoreUserMessageSubRequest,
  SubaccountRevokeSubRequest,
  SubaccountUnrevokeSubRequest,
  SwarmForSubRequest,
  UpdateExpiryOnNodeGroupSubRequest,
  UpdateExpiryOnNodeUserSubRequest,
} from '../apis/snode_api/SnodeRequestTypes';
import { BatchRequests } from '../apis/snode_api/batchRequest';
import { GetNetworkTime } from '../apis/snode_api/getNetworkTime';
import { SnodeNamespace, SnodeNamespaces } from '../apis/snode_api/namespaces';
import {
  SigResultAdmin,
  SigResultSubAccount,
  SnodeGroupSignature,
} from '../apis/snode_api/signature/groupSignature';
import { SnodeSignature, SnodeSignatureResult } from '../apis/snode_api/signature/snodeSignatures';
import { SnodePool } from '../apis/snode_api/snodePool';
import { WithMessagesHashes, WithRevokeSubRequest } from '../apis/snode_api/types';
import { TTL_DEFAULT } from '../constants';
import { ConvoHub } from '../conversations';
import { MessageEncrypter } from '../crypto/MessageEncrypter';
import { addMessagePadding } from '../crypto/BufferPadding';
import { ContentMessage } from '../messages/outgoing';
import { UnsendMessage } from '../messages/outgoing/controlMessage/UnsendMessage';
import { ClosedGroupNewMessage } from '../messages/outgoing/controlMessage/group/ClosedGroupNewMessage';
import { OpenGroupVisibleMessage } from '../messages/outgoing/visibleMessage/OpenGroupVisibleMessage';
import { PubKey } from '../types';
import { OutgoingRawMessage } from '../types/RawMessage';
import { UserUtils } from '../utils';
import { ed25519Str, fromUInt8ArrayToBase64 } from '../utils/String';

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

async function sendSingleMessage({
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

      const subRequests: Array<RawSnodeSubRequests> = [];
      if (PubKey.is05Pubkey(destination)) {
        if (encryptedAndWrapped.namespace === SnodeNamespaces.Default) {
          subRequests.push(
            new StoreUserMessageSubRequest({
              encryptedData: encryptedAndWrapped.encryptedAndWrappedData,
              dbMessageIdentifier: encryptedAndWrapped.identifier || null,
              ttlMs: overridenTtl,
              destination,
            })
          );
        } else if (SnodeNamespace.isUserConfigNamespace(encryptedAndWrapped.namespace)) {
          subRequests.push(
            new StoreUserConfigSubRequest({
              encryptedData: encryptedAndWrapped.encryptedAndWrappedData,
              namespace: encryptedAndWrapped.namespace,
              ttlMs: overridenTtl,
            })
          );
        } else if (encryptedAndWrapped.namespace === SnodeNamespaces.LegacyClosedGroup) {
          subRequests.push(
            new StoreUserMessageSubRequest({
              encryptedData: encryptedAndWrapped.encryptedAndWrappedData,
              dbMessageIdentifier: encryptedAndWrapped.identifier || null,
              ttlMs: overridenTtl,
              destination,
            })
          );
        } else {
          window.log.error(
            `unhandled sendSingleMessage case with details: ${ed25519Str(destination)},namespace: ${
              encryptedAndWrapped.namespace
            }`
          );
          throw new Error(
            `unhandled sendSingleMessage case for 05 ${ed25519Str(destination)} and namespace ${
              encryptedAndWrapped.namespace
            }`
          );
        }
      } else if (PubKey.is03Pubkey(destination)) {
        if (SnodeNamespace.isGroupConfigNamespace(encryptedAndWrapped.namespace)) {
          subRequests.push(
            new StoreGroupConfigOrMessageSubRequest({
              encryptedData: encryptedAndWrapped.encryptedAndWrappedData,
              namespace: encryptedAndWrapped.namespace,
              ttlMs: overridenTtl,
              groupPk: destination,
              dbMessageIdentifier: encryptedAndWrapped.identifier || null,
            })
          );
        } else if (encryptedAndWrapped.namespace === SnodeNamespaces.ClosedGroupMessages) {
          subRequests.push(
            new StoreGroupConfigOrMessageSubRequest({
              encryptedData: encryptedAndWrapped.encryptedAndWrappedData,
              namespace: encryptedAndWrapped.namespace,
              ttlMs: overridenTtl,
              groupPk: destination,
              dbMessageIdentifier: encryptedAndWrapped.identifier || null,
            })
          );
        } else {
          window.log.error(
            `unhandled sendSingleMessage case with details: ${ed25519Str(destination)},namespace: ${
              encryptedAndWrapped.namespace
            }`
          );
          throw new Error(
            `unhandled sendSingleMessage case for 03 ${ed25519Str(destination)} and namespace ${
              encryptedAndWrapped.namespace
            }`
          );
        }
      } else {
        window.log.error(
          `unhandled sendSingleMessage case with details: ${ed25519Str(destination)},namespace: ${
            encryptedAndWrapped.namespace
          }`
        );
        throw new Error(
          `unhandled sendSingleMessage case unsupported destination ${ed25519Str(destination)}`
        );
      }

      const targetNode = await SnodePool.getNodeFromSwarmOrThrow(destination);
      const batchResult = await BatchRequests.doUnsignedSnodeBatchRequestNoRetries(
        subRequests,
        targetNode,
        6000,
        destination,
        false
      );

      await handleBatchResultWithSubRequests({ batchResult, subRequests, destination });

      return {
        wrappedEnvelope: encryptedAndWrapped.encryptedAndWrappedData,
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
  { namespace }: { namespace: SnodeNamespaces },
  destination: string
): Promise<SigResultSubAccount | SigResultAdmin | SnodeSignatureResult | object> {
  const store = 'store' as const;
  if (SnodeNamespace.isUserConfigNamespace(namespace)) {
    const ourPrivKey = (await UserUtils.getUserED25519KeyPairBytes())?.privKeyBytes;
    if (!ourPrivKey) {
      throw new Error(
        'getSignatureParamsFromNamespace UserUtils.getUserED25519KeyPairBytes is empty'
      );
    }
    return SnodeSignature.getSnodeSignatureParamsUs({
      method: store,
      namespace,
    });
  }

  if (
    SnodeNamespace.isGroupConfigNamespace(namespace) ||
    namespace === SnodeNamespaces.ClosedGroupMessages ||
    namespace === SnodeNamespaces.ClosedGroupRevokedRetrievableMessages
  ) {
    if (!PubKey.is03Pubkey(destination)) {
      throw new Error(
        'getSignatureParamsFromNamespace: groupconfig namespace required a 03 pubkey'
      );
    }
    const found = await UserGroupsWrapperActions.getGroup(destination);
    return SnodeGroupSignature.getSnodeGroupSignature({
      method: store,
      namespace,
      group: found,
    });
  }
  // no signature required for this namespace/pubkey combo
  return {};
}

async function signSubRequests(
  params: Array<RawSnodeSubRequests>
): Promise<Array<BuiltSnodeSubRequests>> {
  const signedRequests: Array<BuiltSnodeSubRequests> = await Promise.all(
    params.map(p => {
      if (
        p instanceof SubaccountRevokeSubRequest ||
        p instanceof SubaccountUnrevokeSubRequest ||
        p instanceof DeleteHashesFromUserNodeSubRequest ||
        p instanceof DeleteHashesFromGroupNodeSubRequest ||
        p instanceof DeleteAllFromUserNodeSubRequest ||
        p instanceof StoreGroupConfigOrMessageSubRequest ||
        p instanceof StoreLegacyGroupMessageSubRequest ||
        p instanceof StoreUserConfigSubRequest ||
        p instanceof StoreUserMessageSubRequest ||
        p instanceof RetrieveUserSubRequest ||
        p instanceof RetrieveGroupSubRequest ||
        p instanceof UpdateExpiryOnNodeUserSubRequest ||
        p instanceof UpdateExpiryOnNodeGroupSubRequest ||
        p instanceof GetExpiriesFromNodeSubRequest
      ) {
        return p.buildAndSignParameters();
      }

      if (
        p instanceof RetrieveLegacyClosedGroupSubRequest ||
        p instanceof SwarmForSubRequest ||
        p instanceof OnsResolveSubRequest ||
        p instanceof GetServiceNodesSubRequest ||
        p instanceof NetworkTimeSubRequest
      ) {
        return p.build();
      }

      assertUnreachable(
        p,
        'If you see this error, you need to add the handling of the rawRequest above'
      );
      throw new Error(
        'If you see this error, you need to add the handling of the rawRequest above'
      );
    })
  );

  return signedRequests;
}

async function sendMessagesDataToSnode(
  storeRequests: Array<
    | StoreGroupConfigOrMessageSubRequest
    | StoreUserConfigSubRequest
    | StoreUserMessageSubRequest
    | StoreLegacyGroupMessageSubRequest
  >,
  asssociatedWith: PubkeyType | GroupPubkeyType,
  {
    messagesHashes: messagesToDelete,
    revokeSubRequest,
    unrevokeSubRequest,
  }: WithMessagesHashes & WithRevokeSubRequest,
  method: MethodBatchType
): Promise<NotEmptyArrayOfBatchResults> {
  if (!asssociatedWith) {
    throw new Error('sendMessagesDataToSnode first subrequest pubkey needs to be set');
  }

  const deleteHashesSubRequest = !messagesToDelete.length
    ? null
    : PubKey.is05Pubkey(asssociatedWith)
      ? new DeleteHashesFromUserNodeSubRequest({ messagesHashes: messagesToDelete })
      : new DeleteHashesFromGroupNodeSubRequest({
          messagesHashes: messagesToDelete,
          groupPk: asssociatedWith,
        });

  if (storeRequests.some(m => m.destination !== asssociatedWith)) {
    throw new Error(
      'sendMessagesDataToSnode tried to send batchrequest containing subrequest not for the right destination'
    );
  }

  const rawRequests = compact([
    ...storeRequests,
    deleteHashesSubRequest,
    revokeSubRequest,
    unrevokeSubRequest,
  ]);
  const targetNode = await SnodePool.getNodeFromSwarmOrThrow(asssociatedWith);

  try {
    const storeResults = await BatchRequests.doUnsignedSnodeBatchRequestNoRetries(
      rawRequests,
      targetNode,
      6000,
      asssociatedWith,
      false,
      method
    );

    if (!storeResults || !storeResults.length) {
      window?.log?.warn(
        `SessionSnodeAPI::doUnsignedSnodeBatchRequestNoRetries on ${targetNode.ip}:${targetNode.port} returned falsish value`,
        storeResults
      );
      throw new Error('doUnsignedSnodeBatchRequestNoRetries: Invalid result');
    }
    await handleBatchResultWithSubRequests({
      batchResult: storeResults,
      subRequests: rawRequests,
      destination: asssociatedWith,
    });

    const firstResult = storeResults[0];

    if (firstResult.code !== 200) {
      window?.log?.warn(
        'first result status is not 200 for sendMessagesDataToSnode but: ',
        firstResult.code
      );
      throw new Error('sendMessagesDataToSnode: Invalid status code');
    }

    GetNetworkTime.handleTimestampOffsetFromNetwork('store', firstResult.body.t);

    if (!isEmpty(storeResults)) {
      window?.log?.info(
        `sendMessagesDataToSnode - Successfully stored messages to ${ed25519Str(
          asssociatedWith
        )} via ${targetNode.ip}:${targetNode.port}`
      );
    }

    return storeResults;
  } catch (e) {
    const snodeStr = targetNode ? `${targetNode.ip}:${targetNode.port}` : 'null';
    window?.log?.warn(
      `sendMessagesDataToSnode - "${e.code}:${e.message}" to ${asssociatedWith} via snode:${snodeStr}`
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
  networkTimestamp: number;
  encryptedAndWrappedData: Uint8Array;
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

  const envelope = wrapContentIntoEnvelope(
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

  return {
    networkTimestamp,
    encryptedAndWrappedData: cipherText,
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

  const envelope = wrapContentIntoEnvelope(
    envelopeType,
    recipient.key,
    networkTimestamp,
    cipherText
  );
  const data = wrapEnvelopeInWebSocketMessage(envelope);

  return {
    encryptedAndWrappedData: data,
    networkTimestamp,
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
 * Warning:
 *   This does not handle result of messages and marking messages as read, syncing them currently.
 *   For this, use the `MessageQueue.sendSingleMessage()` for now.
 *
 * @param params the data to deposit
 * @param destination the pubkey we should deposit those message to
 * @returns the hashes of successful deposit
 */
async function sendEncryptedDataToSnode({
  destination,
  storeRequests,
  messagesHashesToDelete,
  revokeSubRequest,
  unrevokeSubRequest,
}: WithRevokeSubRequest & {
  storeRequests: Array<StoreGroupConfigOrMessageSubRequest | StoreUserConfigSubRequest>;
  destination: GroupPubkeyType | PubkeyType;
  messagesHashesToDelete: Set<string> | null;
}): Promise<NotEmptyArrayOfBatchResults | null> {
  try {
    const batchResults = await pRetry(
      async () => {
        return MessageSender.sendMessagesDataToSnode(
          storeRequests,
          destination,
          {
            messagesHashes: [...(messagesHashesToDelete || [])],
            revokeSubRequest,
            unrevokeSubRequest,
          },
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

function wrapContentIntoEnvelope(
  type: SignalService.Envelope.Type,
  sskSource: string | undefined,
  timestamp: number,
  content: Uint8Array
): SignalService.Envelope {
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
  sendSingleMessage,
  isContentSyncMessage,
  wrapContentIntoEnvelope,
  getSignatureParamsFromNamespace,
  signSubRequests,
};

/**
 * Note: this function does not handle the syncing logic of messages yet.
 * Use it to push message to group, to note to self, or with user messages which do not require a syncing logic
 */
async function handleBatchResultWithSubRequests({
  batchResult,
  destination,
  subRequests,
}: {
  batchResult: NotEmptyArrayOfBatchResults;
  subRequests: Array<RawSnodeSubRequests>;
  destination: string;
}) {
  const isDestinationClosedGroup = ConvoHub.use().get(destination)?.isClosedGroup();
  if (!batchResult || !isArray(batchResult) || isEmpty(batchResult)) {
    window.log.error('handleBatchResultWithSubRequests: invalid batch result ');
    return;
  }
  const us = UserUtils.getOurPubKeyStrFromCache();

  const seenHashes: Array<SeenMessageHashes> = [];
  for (let index = 0; index < subRequests.length; index++) {
    const subRequest = subRequests[index];

    // there are some stuff we need to do when storing a message (for a group/legacy group or user, but no config messages)
    if (
      subRequest instanceof StoreGroupConfigOrMessageSubRequest ||
      subRequest instanceof StoreLegacyGroupMessageSubRequest ||
      subRequest instanceof StoreUserMessageSubRequest
    ) {
      const storedAt = batchResult?.[index]?.body?.t;
      const storedHash = batchResult?.[index]?.body?.hash;
      const subRequestStatusCode = batchResult?.[index]?.code;

      // TODO: the expiration is due to be returned by the storage server on "store" soon, we will then be able to use it instead of doing the storedAt + ttl logic below
      // if we have a hash and a storedAt, mark it as seen so we don't reprocess it on the next retrieve

      if (
        subRequestStatusCode === 200 &&
        !isEmpty(storedHash) &&
        isString(storedHash) &&
        isNumber(storedAt)
      ) {
        seenHashes.push({
          expiresAt: GetNetworkTime.now() + TTL_DEFAULT.CONTENT_MESSAGE, // non config msg expire at CONTENT_MESSAGE at most
          hash: storedHash,
        });

        // We need to store the hash of our synced message when for a 1o1. (as this is the one stored on our swarm)
        // For groups, we can just store that hash directly as the group's swarm is hosting all of the group messages

        if (
          subRequest.dbMessageIdentifier &&
          (subRequest.destination === us || isDestinationClosedGroup)
        ) {
          // get a fresh copy of the message from the DB
          /* eslint-disable no-await-in-loop */
          const foundMessage = await Data.getMessageById(subRequest.dbMessageIdentifier);
          if (foundMessage) {
            await foundMessage.updateMessageHash(storedHash);
            // - a message pushed to a group is always synced
            // - a message sent to ourself when it was a marked as sentSync is a synced message to ourself
            if (
              isDestinationClosedGroup ||
              (subRequest.destination === us && foundMessage.get('sentSync'))
            ) {
              foundMessage.set({ synced: true });
            }
            foundMessage.set({
              sent_to: [subRequest.destination],
              sent: true,
              sent_at: storedAt,
            });
            await foundMessage.commit();
            await foundMessage.getConversation()?.updateLastMessage();
            window?.log?.info(`updated message ${foundMessage.get('id')} with hash: ${storedHash}`);
          }
          /* eslint-enable no-await-in-loop */
        }
      }
    }
  }
  await Data.saveSeenMessageHashes(seenHashes);
}
