import _, { compact, isArray, isNumber, isObject, pick } from 'lodash';
import {
  getV2OpenGroupRoom,
  getV2OpenGroupRoomsByServerUrl,
  saveV2OpenGroupRoom,
} from '../../../../data/opengroups';
import { handleOpenGroupV4Message } from '../../../../receiver/opengroup';
import { OpenGroupRequestCommonType } from '../opengroupV2/ApiUtil';
import { BatchSogsReponse, OpenGroupBatchRow } from './sogsV3BatchPoll';
import {
  getRoomAndUpdateLastFetchTimestamp,
  OpenGroupMessageV4,
} from '../opengroupV2/OpenGroupServerPoller';
import { getOpenGroupV2ConversationId } from '../utils/OpenGroupUtils';
import { handleCapabilities } from './sogsCapabilities';
import { getConversationController } from '../../../conversations';
import { ConversationModel } from '../../../../models/conversation';
import { filterDuplicatesFromDbAndIncomingV4 } from '../opengroupV2/SogsFilterDuplicate';
import { callUtilsWorker } from '../../../../webworker/workers/util_worker_interface';
import { PubKey } from '../../../types';
import { getSodiumRenderer } from '../../../crypto';
import { findCachedBlindedMatchOrItLookup } from './knownBlindedkeys';
import { decryptWithSessionBlindingProtocol } from './sogsBlinding';
import { base64_variants, from_base64 } from 'libsodium-wrappers-sumo';
import { UserUtils } from '../../../utils';

/**
 * Get the convo matching those criteria and make sure it is an opengroup convo, or return null.
 * If you get null, you most likely need to cancel the processing of whatever you are doing
 */
function getSogsConvoOrReturnEarly(serverUrl: string, roomId: string): ConversationModel | null {
  const convoId = getOpenGroupV2ConversationId(serverUrl, roomId);
  if (!convoId) {
    window.log.info(`getSogsConvoOrReturnEarly: convoId not built with ${serverUrl}: ${roomId}`);
    return null;
  }

  const foundConvo = getConversationController().get(convoId);
  if (!foundConvo) {
    window.log.info('getSogsConvoOrReturnEarly: convo not found: ', convoId);
    return null;
  }

  if (!foundConvo.isOpenGroupV2()) {
    window.log.info('getSogsConvoOrReturnEarly: convo not an opengroup: ', convoId);
    return null;
  }

  return foundConvo;
}

/**
 *
 * Handle the pollinfo from the response of a pysogs.
 * Pollinfos contains the subscriberCount (active users), the read, upload and write things we as a user can do.
 */
async function handlePollInfoResponse(
  statusCode: number,
  pollInfoResponseBody: {
    active_users: number;
    read: boolean;
    token: string;
    upload: boolean;
    write: boolean;
  },
  serverUrl: string,
  roomIdsStillPolled: Set<string>
) {
  if (statusCode !== 200) {
    window.log.info('handlePollInfoResponse subRequest status code is not 200');
    return;
  }

  if (!isObject(pollInfoResponseBody)) {
    window.log.info('handlePollInfoResponse pollInfoResponseBody is not object');
    return;
  }

  const { active_users, read, upload, write, token } = pollInfoResponseBody;

  if (!token || !serverUrl) {
    window.log.info('handlePollInfoResponse token and serverUrl must be set');
    return;
  }

  if (!roomIdsStillPolled.has(token)) {
    window.log.info('handlePollInfoResponse room is no longer polled: ', token);
    return;
  }

  const foundConvo = getSogsConvoOrReturnEarly(serverUrl, token);
  if (!foundConvo) {
    return; // we already print something in getSogsConvoOrReturnEarly
  }

  await foundConvo.setPollInfo({ read, write, upload, subscriberCount: active_users });
}

async function filterOutMessagesInvalidSignature(
  messagesFilteredBlindedIds: Array<OpenGroupMessageV4>
) {
  const sentToWorker = messagesFilteredBlindedIds.map(m => {
    return {
      sender: PubKey.cast(m.session_id).key, // we need to keep the prefix if this is a blinded or not pubkey
      base64EncodedSignature: m.signature,
      base64EncodedData: m.data,
    };
  });
  const startVerify = Date.now();
  const signatureValidEncodedData = (await callUtilsWorker(
    'verifyAllSignatures',
    sentToWorker
  )) as Array<string>;
  const signaturesValidMessages = compact(
    (signatureValidEncodedData || []).map(validData =>
      messagesFilteredBlindedIds.find(m => m.data === validData)
    )
  );
  window.log.info(`[perf] verifyAllSignatures took ${Date.now() - startVerify}ms.`);

  return signaturesValidMessages;
}

const handleNewMessagesResponseV4 = async (
  messages: Array<OpenGroupMessageV4>,
  serverUrl: string,
  subrequestOption: OpenGroupBatchRow,
  roomIdsStillPolled: Set<string>
) => {
  if (!subrequestOption || !subrequestOption.messages) {
    window?.log?.error('handleBatchPollResults - missing fields required for message subresponse');
    return;
  }

  try {
    const { roomId } = subrequestOption.messages;

    if (!roomIdsStillPolled.has(roomId)) {
      window.log.info(
        `handleNewMessagesResponseV4: we are no longer polling for ${roomId}: skipping`
      );
      return;
    }
    const convoId = getOpenGroupV2ConversationId(serverUrl, roomId);

    const roomInfos = await getRoomAndUpdateLastFetchTimestamp(convoId, messages);
    if (!roomInfos || !roomInfos.conversationId) {
      return;
    }
    const serverPk = roomInfos.serverPublicKey;
    const messagesWithValidSignature = await filterOutMessagesInvalidSignature(messages);
    // we do a first check with blinded ids. Looking to filter out messages we already received from that blinded id.
    const messagesFilteredBlindedIds = await filterDuplicatesFromDbAndIncomingV4(
      messagesWithValidSignature
    );
    console.warn('messagesFilteredBlindedIds', messagesFilteredBlindedIds);

    const sodium = await getSodiumRenderer();
    const roomDetails: OpenGroupRequestCommonType = pick(roomInfos, 'serverUrl', 'roomId');
    // then we try to find matching real session ids with the blinded ids we have.
    // this is where we override the blindedId with the real one in case we already know that user real sessionId

    // tslint:disable: prefer-for-of
    const messagesWithResolvedBlindedIdsIfFound = [];
    for (let index = 0; index < messagesFilteredBlindedIds.length; index++) {
      const newMessage = messagesFilteredBlindedIds[index];
      const unblindedIdFound = await findCachedBlindedMatchOrItLookup(
        newMessage.session_id,
        serverPk,
        sodium
      );

      // override the sender in the message itself
      if (unblindedIdFound) {
        newMessage.session_id = unblindedIdFound;
      }
      messagesWithResolvedBlindedIdsIfFound.push(newMessage);
    }
    const dedupedUnblindedMessages = await filterDuplicatesFromDbAndIncomingV4(
      messagesWithResolvedBlindedIdsIfFound
    );
    console.warn('dedupedUnblindedMessages', dedupedUnblindedMessages);

    // we use the unverified newMessages seqno and id as last polled because we actually did poll up to those ids.
    const incomingMessageIds = compact(messages.map(n => n.id));
    const maxNewMessageId = Math.max(...incomingMessageIds);
    const incomingMessageSeqNo = compact(messages.map(n => n.seqno));
    const maxNewMessageSeqNo = Math.max(...incomingMessageSeqNo);
    for (let index = 0; index < dedupedUnblindedMessages.length; index++) {
      const msgToHandle = dedupedUnblindedMessages[index];
      try {
        await handleOpenGroupV4Message(msgToHandle, roomDetails);
      } catch (e) {
        window?.log?.warn('handleOpenGroupV4Message', e);
      }
    }

    // handling all messages might be slow, so instead refersh the data here before updating the fields we care about
    // and writing it again
    const roomInfosRefreshed = getV2OpenGroupRoom(roomInfos.conversationId);
    if (!roomInfosRefreshed || !roomInfosRefreshed.serverUrl || !roomInfosRefreshed.roomId) {
      window.log.warn(`No room for convo ${roomInfos.conversationId}`);
      return;
    }

    // we need to update the timestamp even if we don't have a new MaxMessageServerId
    if (isNumber(maxNewMessageId) && isFinite(maxNewMessageId)) {
      roomInfosRefreshed.lastMessageFetchedServerID = maxNewMessageId;
    }
    if (isNumber(maxNewMessageSeqNo) && isFinite(maxNewMessageSeqNo)) {
      roomInfosRefreshed.maxMessageFetchedSeqNo = maxNewMessageSeqNo;
    }
    roomInfosRefreshed.lastFetchTimestamp = Date.now();

    await saveV2OpenGroupRoom(roomInfosRefreshed);
  } catch (e) {
    window?.log?.warn('handleNewMessages failed:', e);
  }
};

type InboxResponseObject = {
  id: number; // that specific inbox message id
  sender: string; // blindedPubkey of the sender, the unblinded one is inside message content, encrypted only for our blinded pubkey
  posted_at: number; // timestamp as seconds.microsec
  message: string; // base64 data
};

async function handleInboxMessages(inboxResponse: Array<InboxResponseObject>, serverUrl: string) {
  // inbox messages are blinded so decrypt them using the blinding logic.
  // handle them as a message request after that.
  if (!inboxResponse || !isArray(inboxResponse) || inboxResponse.length === 0) {
    //nothing to do
    return;
  }

  const roomInfos = getV2OpenGroupRoomsByServerUrl(serverUrl);
  if (!roomInfos || !roomInfos.length || !roomInfos[0].serverPublicKey) {
    return;
  }
  const ourKeypairBytes = await UserUtils.getUserED25519KeyPairBytes();
  if (!ourKeypairBytes) {
    throw new Error('handleInboxMessages needs current user keypair');
  }
  const serverPubkey = roomInfos[0].serverPublicKey;

  const decryptedInboxMessages = await Promise.all(
    inboxResponse.map(async inboxItem => {
      const isOutgoing = false;
      try {
        const data = from_base64(inboxItem.message, base64_variants.ORIGINAL);

        const otherBlindedPubkey = inboxItem.sender;
        const result = await decryptWithSessionBlindingProtocol(
          data,
          isOutgoing,
          otherBlindedPubkey,
          serverPubkey,
          ourKeypairBytes
        );
        console.warn('result', result);
      } catch (e) {
        console.warn(e);
      }
    })
  );
  console.warn({ decryptedInboxMessages });
}

export const handleBatchPollResults = async (
  serverUrl: string,
  batchPollResults: BatchSogsReponse,
  /** using this as explicit way to ensure order  */
  subrequestOptionsLookup: Array<OpenGroupBatchRow>,
  roomIdsStillPolled: Set<string> // if we get anything for a room we stopped polling, we need to skip it.
) => {
  // @@: Might not need the explicit type field.
  // pro: prevents cases where accidentally two fields for the opt. e.g. capability and message fields truthy.
  // con: the data can be inferred (excluding above case) so it's close to being a redundant field

  // note: handling capabilities first before handling anything else as it affects how things are handled.

  await handleCapabilities(subrequestOptionsLookup, batchPollResults, serverUrl);

  if (batchPollResults && isArray(batchPollResults.body)) {
    await Promise.all(
      batchPollResults.body.map(async (subResponse: any, index: number) => {
        // using subreqOptions as request type lookup,
        //assumes batch subresponse order matches the subrequest order
        const subrequestOption = subrequestOptionsLookup[index];
        const responseType = subrequestOption.type;

        switch (responseType) {
          case 'capabilities':
            // capabilities are handled in handleCapabilities and are skipped here just to avoid the default case below
            break;
          case 'messages':
            return handleNewMessagesResponseV4(
              subResponse.body,
              serverUrl,
              subrequestOption,
              roomIdsStillPolled
            );

          // redundant - Probably already getting handled first due to the early search before this loop
          case 'pollInfo':
            // TODO: handle handle pollInfo
            await handlePollInfoResponse(
              subResponse.code,
              subResponse.body,
              serverUrl,
              roomIdsStillPolled
            );
            break;

          case 'inbox':
            await handleInboxMessages(subResponse.body, serverUrl);

            break;

          default:
            console.error('No matching subrequest response body for type: ', responseType);
        }
      })
    );
  }
};
