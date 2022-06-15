import _, { compact, isArray, isObject, pick } from 'lodash';
import { saveV2OpenGroupRoom } from '../../../../data/opengroups';
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

const handleNewMessagesResponseV4 = async (
  messages: Array<OpenGroupMessageV4>,
  serverUrl: string,
  subrequestOption: OpenGroupBatchRow,
  capabilities: Array<string> | null,
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
    if (!roomInfos) {
      return;
    }

    const newMessages = await filterDuplicatesFromDbAndIncomingV4(messages);

    const incomingMessageIds = compact(newMessages.map(n => n.id));
    const maxNewMessageId = Math.max(...incomingMessageIds);
    // TODO filter out duplicates ?

    const roomDetails: OpenGroupRequestCommonType = pick(roomInfos, 'serverUrl', 'roomId');

    // tslint:disable-next-line: prefer-for-of
    for (let index = 0; index < newMessages.length; index++) {
      const newMessage = newMessages[index];
      try {
        await handleOpenGroupV4Message(newMessage, roomDetails, capabilities);
      } catch (e) {
        window?.log?.warn('handleOpenGroupV4Message', e);
      }
    }

    // we need to update the timestamp even if we don't have a new MaxMessageServerId
    roomInfos.lastMessageFetchedServerID = maxNewMessageId;
    roomInfos.lastFetchTimestamp = Date.now();
    // TODO: save capabilities to the room in database. (or in cache if possible)
    await saveV2OpenGroupRoom(roomInfos);
  } catch (e) {
    window?.log?.warn('handleNewMessages failed:', e);
  }
};

async function handleInboxMessages(_inboxResponse: any, _serverUrl: string) {
  // inbox messages are blinded so decrypt them using the blinding logic.
  // handle them as a message request after that.
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

  const capabilities = await handleCapabilities(
    subrequestOptionsLookup,
    batchPollResults,
    serverUrl
  );

  if (batchPollResults && isArray(batchPollResults.body)) {
    // TODO: typing for subrequest result, but may be annoying to do.
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
              capabilities,
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
            // TODO: handle inbox
            console.error(' STUB - handle inbox');
            await handleInboxMessages(subResponse.body, serverUrl);

            break;

          default:
            console.error('No matching subrequest response body for type: ', responseType);
        }
      })
    );
  }
};
