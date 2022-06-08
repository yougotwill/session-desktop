import { from_hex } from 'libsodium-wrappers-sumo';
import _ from 'lodash';
import { getConversationById } from '../../../../data/data';
import {
  getV2OpenGroupRoomsByServerUrl,
  OpenGroupV2Room,
  saveV2OpenGroupRoom,
} from '../../../../data/opengroups';
import { handleOpenGroupV4Message } from '../../../../receiver/opengroup';
import { ResponseDecodedV4 } from '../../../onions/onionv4';
import { UserUtils } from '../../../utils';
import { OpenGroupRequestCommonType } from '../opengroupV2/ApiUtil';
import { OpenGroupBatchRow, SubrequestOptionType } from './sogsV3BatchPoll';
import { getBlindedPubKey } from './sogsBlinding';
import {
  getRoomAndUpdateLastFetchTimestamp,
  OpenGroupMessageV4,
} from '../opengroupV2/OpenGroupServerPoller';
import { getOpenGroupV2ConversationId } from '../utils/OpenGroupUtils';

// TODO: Move to separate (v3?) openGroupAPIV3.ts
async function handlePollInfoResponse(
  pollInfoResponseBody: {
    active_users: number;
    read: boolean;
    token: string;
    upload: boolean;
    write: boolean;
  }
  // serverUrl: string,
  // roomId: string
) {
  // example body structure
  // body:
  // active_users: 2
  // read: true
  // token: "warricktest"
  // upload: true
  // write: true

  const { active_users, read, token, upload, write } = pollInfoResponseBody;
  const pollInfo = {
    activeUsers: active_users,
    read,
    token,
    upload,
    write,
  };

  console.warn({ pollInfo });

  // const convo = await getOpenGroupV2ConversationId(serverUrl, roomId);
  // TODO: handle pollInfo
}

const handleNewMessagesResponseV4 = async (
  newMessages: Array<OpenGroupMessageV4>,
  serverUrl: string,
  subrequestOption: OpenGroupBatchRow,
  capabilities?: Array<string>
) => {
  // #region data examples
  // @@: Example body of a message from compact polling.
  // data: "ChEKATE4spz6rYIwqgYECgJva4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  // public_key: "0588ee09cce1cbf57ae1bfeb457ba769059bd8b510b273640b9c215168f3cc1636"
  // server_id: 210
  // signature: "UCoc/HbonrXtxBDSyj48yzLdyVgPr4WPCrdf4TKQsgoBfBx7YV4Z4OwTNVhV3kdfs1cc+4fIYY1XSyz+eOFjDw=="
  // timestamp: 1649900688833
  // #endregion
  if (!subrequestOption || !subrequestOption.messages) {
    window?.log?.error('handleBatchPollResults - missing fields required for message subresponse');
    return;
  }

  try {
    const { roomId } = subrequestOption.messages;
    const convoId = getOpenGroupV2ConversationId(serverUrl, roomId);
    const roomInfos = await getRoomAndUpdateLastFetchTimestamp(convoId, newMessages);
    if (!roomInfos) {
      return;
    }

    const incomingMessageIds = _.compact(newMessages.map(n => n.id));
    const maxNewMessageId = Math.max(...incomingMessageIds);
    // TODO filter out duplicates ?

    const roomDetails: OpenGroupRequestCommonType = _.pick(roomInfos, 'serverUrl', 'roomId');

    // tslint:disable-next-line: prefer-for-of
    for (let index = 0; index < newMessages.length; index++) {
      const newMessage = newMessages[index];
      try {
        // await handleOpenGroupV4Message(newMessage, roomDetails, capabilities);
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

/**
 * @param subrequestOptionsLookup list of subrequests used for the batch request (order sensitive)
 * @param batchPollResults The result from the batch request (order sensitive)
 */
const getCapabilitiesFromBatch = (
  subrequestOptionsLookup: Array<OpenGroupBatchRow>,
  batchPollResults: ResponseDecodedV4
) => {
  const capabilitiesBatchIndex = _.findIndex(
    subrequestOptionsLookup,
    (subrequest: OpenGroupBatchRow) => {
      return subrequest.type === SubrequestOptionType.capabilities;
    }
  );
  const capabilities = batchPollResults.body[capabilitiesBatchIndex].body.capabilities;
  return capabilities;
};

export const handleBatchPollResults = async (
  serverUrl: string,
  batchPollResults: ResponseDecodedV4,
  /** using this as explicit way to ensure order and prevent case where two  */
  subrequestOptionsLookup: Array<OpenGroupBatchRow>
) => {
  // @@: Might not need the explicit type field.
  // pro: prevents cases where accidentally two fields for the opt. e.g. capability and message fields truthy.
  // con: the data can be inferred (excluding above case) so it's close to being a redundant field

  // note: handling capabilities first before handling anything else as it affects how things are handled.
  const capabilities = getCapabilitiesFromBatch(subrequestOptionsLookup, batchPollResults);
  await handleCapabilities(capabilities, serverUrl);

  console.warn({ batchPollResults });

  // TODO: typing for subrequest result, but may be annoying to do.
  await Promise.all(
    batchPollResults.body.map(async (subResponse: any, index: number) => {
      // using subreqOptions as request type lookup,
      //assumes batch subresponse order matches the subrequest order
      const subrequestOption = subrequestOptionsLookup[index];
      const responseType = subrequestOptionsLookup[index].type;

      switch (responseType) {
        case SubrequestOptionType.messages:
          return handleNewMessagesResponseV4(
            subResponse.body,
            serverUrl,
            subrequestOption,
            capabilities
          );

        // redundant - Probably already getting handled first due to the early search before this loop
        case SubrequestOptionType.pollInfo:
          // TODO: handle handle pollInfo
          console.warn('STUB - handle poll info');
          break;

        case SubrequestOptionType.inbox:
          // TODO: handle inbox
          console.warn(' STUB - handle inbox');
          break;

        default:
          console.warn('No matching subrequest response body');
      }
    })
  );
};

const handleCapabilities = async (
  capabilities: Array<string>,
  serverUrl: string
  // roomId: string
) => {
  if (!capabilities) {
    window?.log?.error('Failed capabilities subrequest - cancelling response handling');
    return;
  }

  // get all v2OpenGroup rooms with the matching serverUrl and set the capabilities.
  console.warn('capabilities and server url, ', capabilities, serverUrl);
  // TODO: implement - update capabilities. Unsure whether to store in DB or save to instance of this obj.
  const rooms = await getV2OpenGroupRoomsByServerUrl(serverUrl);
  console.warn({ groupsByServerUrl: rooms });

  if (!rooms || !rooms.length) {
    window?.log?.error('handleCapabilities - Found no groups with matching server url');
    return;
  }

  await Promise.all(
    rooms.map(async (room: OpenGroupV2Room) => {
      // doing this to get the roomId? and conversationId? Optionally could include

      // TODO: uncomment once complete
      // if (_.isEqual(room.capabilities, capabilities)) {
      //   return;
      // }

      // updating the db values for the open group room
      const roomUpdate = { ...room, capabilities };
      await saveV2OpenGroupRoom(roomUpdate);

      // updating values in the conversation
      // generate blindedPK for
      if (capabilities.includes('blind') && room.conversationId) {
        // generate blinded PK for the room and save it to the conversation.
        const conversationToAddBlindedKey = await getConversationById(room.conversationId);

        if (!conversationToAddBlindedKey) {
          window?.log?.error('No conversation to add blinded pubkey to');
        }

        const ourSignKeyBytes = await UserUtils.getUserED25519KeyPairBytes();
        if (!room.serverPublicKey || !ourSignKeyBytes) {
          window?.log?.error(
            'handleCapabilities - missing required signing keys or server public key for blinded key generation'
          );
          return;
        }

        const blindedPubKey = await getBlindedPubKey(
          from_hex(room.serverPublicKey),
          ourSignKeyBytes
        );

        if (!blindedPubKey) {
          window?.log?.error('Failed to generate blinded pubkey');
          return;
        }

        throw new Error('yo todo');
        // await conversationToAddBlindedKey?.set({
        //   blindedPubKey,
        // });
      }
    })
  );
};
