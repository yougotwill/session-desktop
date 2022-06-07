import { AbortController } from 'abort-controller';
import { getConversationController } from '../../../conversations';
import { getOpenGroupV2ConversationId } from '../utils/OpenGroupUtils';
import { OpenGroupRequestCommonType } from './ApiUtil';
import {
  compactFetchEverything,
  getAllBase64AvatarForRooms,
  getAllMemberCount,
  ParsedBase64Avatar,
  ParsedDeletions,
  ParsedMemberCount,
  ParsedRoomCompactPollResults,
} from './OpenGroupAPIV2CompactPoll';
import _, { now } from 'lodash';
import { ConversationModel } from '../../../../models/conversation';
import {
  getConversationById,
  getMessageIdsFromServerIds,
  removeMessage,
} from '../../../../data/data';
import {
  getV2OpenGroupRoom,
  getV2OpenGroupRoomsByServerUrl,
  OpenGroupV2Room,
  saveV2OpenGroupRoom,
} from '../../../../data/opengroups';
import { OpenGroupMessageV2 } from './OpenGroupMessageV2';
import autoBind from 'auto-bind';
import { sha256 } from '../../../crypto';
import { DURATION } from '../../../constants';
import { processNewAttachment } from '../../../../types/MessageAttachment';
import { MIME } from '../../../../types';
import { handleOpenGroupV2Message, handleOpenGroupV4Message } from '../../../../receiver/opengroup';
import { callUtilsWorker } from '../../../../webworker/workers/util_worker_interface';
import { filterDuplicatesFromDbAndIncoming } from './SogsFilterDuplicate';
import { batchPoll, OpenGroupBatchRow, SubrequestOptionType } from './OpenGroupAPIBatchPoll';
import { getBlindedPubKey } from './OpenGroupAuthentication';
import { UserUtils } from '../../../utils';
import { from_hex } from 'libsodium-wrappers-sumo';
import { ResponseDecodedV4 } from '../../../onions/onionv4';

export type OpenGroupMessageV4 = {
  /** AFAIK: indicates the number of the message in the group. e.g. 2nd message will be 1 or 2 */
  seqno: number;
  session_id: string;
  /** base64 */
  signature: string;
  /** timestamp number with decimal */
  posted: number;
  id: number;
  data: string;
};

const pollForEverythingInterval = DURATION.SECONDS * 10;
const pollForRoomAvatarInterval = DURATION.DAYS * 1;
const pollForMemberCountInterval = DURATION.MINUTES * 10;

/**
 * An OpenGroupServerPollerV2 polls for everything for a particular server. We should
 * have only have one OpenGroupServerPollerV2 per opengroup polling.
 *
 * So even if you have several rooms on the same server, you should only have one OpenGroupServerPollerV2
 * for this server.
 */
export class OpenGroupServerPoller {
  /**
   * The server url to poll for this opengroup poller.
   * Remember, we have one poller per opengroup poller, no matter how many rooms we have joined on this same server
   */
  private readonly serverUrl: string;

  /**
   * The set of rooms to poll from.
   *
   */
  private readonly roomIdsToPoll: Set<string> = new Set();

  /**
   * This timer is used to tick for compact Polling for this opengroup server
   * It ticks every `pollForEverythingInterval` except.
   * If the last run is still in progress, the new one won't start and just return.
   */
  private pollForEverythingTimer?: NodeJS.Timeout;
  private pollForRoomAvatarTimer?: NodeJS.Timeout;
  private pollForMemberCountTimer?: NodeJS.Timeout;
  private readonly abortController: AbortController;

  /**
   * isPolling is set to true when we have a request going for this serverUrl.
   * If we have an interval tick while we still doing a request, the new one will be dropped
   * and only the current one will finish.
   * This is to ensure that we don't trigger too many request at the same time
   */
  private isPolling = false;
  private isPreviewPolling = false;
  private isMemberCountPolling = false;
  private wasStopped = false;

  constructor(roomInfos: Array<OpenGroupRequestCommonType>) {
    autoBind(this);

    if (!roomInfos?.length) {
      throw new Error('Empty roomInfos list');
    }

    // check that all rooms are from the same serverUrl
    const firstUrl = roomInfos[0].serverUrl;
    const every = roomInfos.every(r => r.serverUrl === firstUrl);
    if (!every) {
      throw new Error('All rooms must be for the same serverUrl');
    }
    // first verify the rooms we got are all from on the same server
    window?.log?.info(`Creating a new OpenGroupServerPoller for url ${firstUrl}`);
    this.serverUrl = firstUrl;
    roomInfos.forEach(r => {
      window?.log?.info(
        `Adding room on construct for url serverUrl: ${firstUrl}, roomId:'${r.roomId}' to poller:${this.serverUrl}`
      );
      this.roomIdsToPoll.add(r.roomId);
    });

    this.abortController = new AbortController();
    this.pollForEverythingTimer = global.setInterval(this.compactPoll, pollForEverythingInterval);
    this.pollForRoomAvatarTimer = global.setInterval(
      this.previewPerRoomPoll,
      pollForRoomAvatarInterval
    );
    this.pollForMemberCountTimer = global.setInterval(
      this.pollForAllMemberCount,
      pollForMemberCountInterval
    );

    if (this.roomIdsToPoll.size) {
      void this.triggerPollAfterAdd();
    }
  }

  /**
   * Add a room to the polled room for this server.
   * If a request is already in progress, it will be added only on the next run.
   */
  public addRoomToPoll(room: OpenGroupRequestCommonType) {
    if (room.serverUrl !== this.serverUrl) {
      throw new Error('All rooms must be for the same serverUrl');
    }
    if (this.roomIdsToPoll.has(room.roomId)) {
      window?.log?.info('skipping addRoomToPoll of already polled room:', room);
      return;
    }
    window?.log?.info(
      `Adding room on addRoomToPoll for url serverUrl: ${this.serverUrl}, roomId:'${room.roomId}' to poller:${this.serverUrl}`
    );
    this.roomIdsToPoll.add(room.roomId);

    // if we are not already polling right now, trigger a polling
    void this.triggerPollAfterAdd(room);
  }

  public removeRoomFromPoll(room: OpenGroupRequestCommonType) {
    if (room.serverUrl !== this.serverUrl) {
      window?.log?.info('this is not the correct ServerPoller');
      return;
    }
    if (this.roomIdsToPoll.has(room.roomId)) {
      window?.log?.info(`Removing ${room.roomId} from polling for ${this.serverUrl}`);
      this.roomIdsToPoll.delete(room.roomId);
    } else {
      window?.log?.info(
        `Cannot remove polling of ${room.roomId} as it is not polled on ${this.serverUrl}`
      );
    }
  }

  public getPolledRoomsCount() {
    return this.roomIdsToPoll.size;
  }
  /**
   * Stop polling.
   * Requests currently being made will we canceled.
   * You can NOT restart for now a stopped serverPoller.
   * This has to be used only for quiting the app.
   */
  public stop() {
    if (this.pollForRoomAvatarTimer) {
      global.clearInterval(this.pollForRoomAvatarTimer);
    }

    if (this.pollForMemberCountTimer) {
      global.clearInterval(this.pollForMemberCountTimer);
    }
    if (this.pollForEverythingTimer) {
      // cancel next ticks for each timer
      global.clearInterval(this.pollForEverythingTimer);

      // abort current requests
      this.abortController?.abort();
      this.pollForEverythingTimer = undefined;
      this.pollForRoomAvatarTimer = undefined;
      this.pollForMemberCountTimer = undefined;
      this.wasStopped = true;
    }
  }

  private async triggerPollAfterAdd(_room?: OpenGroupRequestCommonType) {
    await this.compactPoll();
    await this.previewPerRoomPoll();
    await this.pollForAllMemberCount();
  }

  private shouldPoll() {
    if (this.wasStopped) {
      window?.log?.error('Serverpoller was stopped. CompactPoll should not happen');
      return false;
    }
    if (!this.roomIdsToPoll.size) {
      return false;
    }
    // return early if a poll is already in progress
    if (this.isPolling) {
      return false;
    }

    if (!window.getGlobalOnlineStatus()) {
      window?.log?.info('OpenGroupServerPoller: offline');
      return false;
    }
    return true;
  }

  private shouldPollPreview() {
    if (this.wasStopped) {
      window?.log?.error('Serverpoller was stopped. PollPreview should not happen');
      return false;
    }
    if (!this.roomIdsToPoll.size) {
      return false;
    }
    // return early if a poll is already in progress
    if (this.isPreviewPolling) {
      return false;
    }
    if (!window.getGlobalOnlineStatus()) {
      window?.log?.info('OpenGroupServerPoller: offline');
      return false;
    }
    return true;
  }

  private shouldPollForMemberCount() {
    if (this.wasStopped) {
      window?.log?.error('Serverpoller was stopped. PolLForMemberCount should not happen');
      return false;
    }
    if (!this.roomIdsToPoll.size) {
      return false;
    }
    // return early if a poll is already in progress
    if (this.isMemberCountPolling) {
      return false;
    }
    if (!window.getGlobalOnlineStatus()) {
      window?.log?.info('OpenGroupServerPoller: offline');
      return false;
    }
    return true;
  }

  private async previewPerRoomPoll() {
    if (!this.shouldPollPreview()) {
      return;
    }

    // do everything with throwing so we can check only at one place
    // what we have to clean
    try {
      this.isPreviewPolling = true;
      // don't try to make the request if we are aborted
      if (this.abortController.signal.aborted) {
        throw new Error('Poller aborted');
      }

      let previewGotResults = await getAllBase64AvatarForRooms(
        this.serverUrl,
        this.roomIdsToPoll,
        this.abortController.signal
      );

      // check that we are still not aborted
      if (this.abortController.signal.aborted) {
        throw new Error('Abort controller was canceled. Dropping preview request');
      }
      if (!previewGotResults) {
        throw new Error('getPreview: no results');
      }
      // we were not aborted, make sure to filter out roomIds we are not polling for anymore
      previewGotResults = previewGotResults.filter(result => this.roomIdsToPoll.has(result.roomId));

      // ==> At this point all those results need to trigger conversation updates, so update what we have to update
      await handleBase64AvatarUpdate(this.serverUrl, previewGotResults);
    } catch (e) {
      window?.log?.warn('Got error while preview fetch:', e);
    } finally {
      this.isPreviewPolling = false;
    }
  }

  private async pollForAllMemberCount() {
    if (!this.shouldPollForMemberCount()) {
      return;
    }
    // do everything with throwing so we can check only at one place
    // what we have to clean
    try {
      this.isMemberCountPolling = true;
      // don't try to make the request if we are aborted
      if (this.abortController.signal.aborted) {
        throw new Error('Poller aborted');
      }

      let memberCountGotResults = await getAllMemberCount(
        this.serverUrl,
        this.roomIdsToPoll,
        this.abortController.signal
      );

      // check that we are still not aborted
      if (this.abortController.signal.aborted) {
        throw new Error('Abort controller was canceled. Dropping memberCount request');
      }
      if (!memberCountGotResults) {
        throw new Error('MemberCount: no results');
      }
      // we were not aborted, make sure to filter out roomIds we are not polling for anymore
      memberCountGotResults = memberCountGotResults.filter(result =>
        this.roomIdsToPoll.has(result.roomId)
      );

      // ==> At this point all those results need to trigger conversation updates, so update what we have to update
      await handleAllMemberCount(this.serverUrl, memberCountGotResults);
    } catch (e) {
      window?.log?.warn('Got error while memberCount fetch:', e);
    } finally {
      this.isMemberCountPolling = false;
    }
  }

  /**
   * creates subrequest options for a batch request.
   * We need: capabilities, pollInfo, recent messages, DM request inbox messages
   * @returns Array of subrequest options for our main batch request
   */
  private async makeSubrequestInfo() {
    const subrequestOptions: Array<OpenGroupBatchRow> = [];

    // capabilities
    subrequestOptions.push({
      type: SubrequestOptionType.capabilities,
      capabilities: true,
    });

    // adding room specific SOGS subrequests
    this.roomIdsToPoll.forEach(roomId => {
      // poll info
      subrequestOptions.push({
        type: SubrequestOptionType.pollInfo,
        pollInfo: {
          roomId,
          infoUpdated: 0,
          // infoUpdated: -1,
        },
      });

      // messages
      subrequestOptions.push({
        type: SubrequestOptionType.messages,
        messages: {
          roomId,
        },
      });
    });

    if (this.serverUrl) {
      const rooms = await getV2OpenGroupRoomsByServerUrl(this.serverUrl);
      if (rooms?.length) {
        const { capabilities } = rooms[0];
        if (capabilities?.includes('blinding')) {
          // This only works for servers with blinding capabilities
          // adding inbox subrequest info
          subrequestOptions.push({
            type: SubrequestOptionType.inbox,
            inbox: true,
          });
        }
      }
    }

    return subrequestOptions;
  }

  private async compactPoll() {
    if (!this.shouldPoll()) {
      return;
    }

    // do everything with throwing so we can check only at one place
    // what we have to clean
    try {
      this.isPolling = true;
      // don't try to make the request if we are aborted
      if (this.abortController.signal.aborted) {
        throw new Error('Poller aborted');
      }

      let compactFetchResults = await compactFetchEverything(
        this.serverUrl,
        this.roomIdsToPoll,
        this.abortController.signal
      );

      const subrequestOptions: Array<OpenGroupBatchRow> = await this.makeSubrequestInfo();

      // TODO: move to own async function
      const batchPollResults = await batchPoll(
        this.serverUrl,
        this.roomIdsToPoll,
        this.abortController.signal,
        subrequestOptions
      );

      // TODO: move this to it's own polling function entirely. I.e. use it's own timer
      if (batchPollResults) {
        await handleBatchPollResults(this.serverUrl, batchPollResults, subrequestOptions);
      }

      // check that we are still not aborted
      if (this.abortController.signal.aborted) {
        throw new Error('Abort controller was cancelled. dropping request');
      }
      if (!compactFetchResults) {
        throw new Error('compactFetch: no results');
      }
      // we were not aborted, make sure to filter out roomIds we are not polling for anymore
      compactFetchResults = compactFetchResults.filter(result =>
        this.roomIdsToPoll.has(result.roomId)
      );

      // ==> At this point all those results need to trigger conversation updates, so update what we have to update
      await handleCompactPollResults(this.serverUrl, compactFetchResults);
    } catch (e) {
      window?.log?.warn('Got error while compact fetch:', e.message);
    } finally {
      this.isPolling = false;
    }
  }
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

const handleBatchPollResults = async (
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

const handleInboxMessages = async (inboxResponse: any, serverUrl: string) => {
  // inbox messages are blinded so decrypt them using the blinding logic.
  // handle them as a message request after that.
};

const handleDeletions = async (
  deleted: ParsedDeletions,
  conversationId: string,
  convo?: ConversationModel
) => {
  const allIdsRemoved = (deleted || []).map(d => d.deleted_message_id);
  const allRowIds = (deleted || []).map(d => d.id);
  const maxDeletedId = Math.max(...allRowIds);
  try {
    const messageIds = await getMessageIdsFromServerIds(allIdsRemoved, conversationId);

    await Promise.all(
      (messageIds || []).map(async id => {
        if (convo) {
          await convo.removeMessage(id);
        }
        await removeMessage(id);
      })
    );
    //
  } catch (e) {
    window?.log?.warn('handleDeletions failed:', e);
  } finally {
    try {
      const roomInfos = await getV2OpenGroupRoom(conversationId);

      if (roomInfos && roomInfos.lastMessageDeletedServerID !== maxDeletedId) {
        roomInfos.lastMessageDeletedServerID = maxDeletedId;
        await saveV2OpenGroupRoom(roomInfos);
      }
    } catch (e) {
      window?.log?.warn('handleDeletions updating roomInfos failed:', e);
    }
  }
};

const getRoomAndUpdateLastFetchTimestamp = async (
  conversationId: string,
  newMessages: Array<OpenGroupMessageV2 | OpenGroupMessageV4>
) => {
  const roomInfos = await getV2OpenGroupRoom(conversationId);
  if (!roomInfos || !roomInfos.serverUrl || !roomInfos.roomId) {
    throw new Error(`No room for convo ${conversationId}`);
  }

  if (!newMessages.length) {
    // if we got no new messages, just write our last update timestamp to the db
    roomInfos.lastFetchTimestamp = Date.now();
    window?.log?.info(
      `No new messages for ${roomInfos.roomId}... just updating our last fetched timestamp`
    );
    await saveV2OpenGroupRoom(roomInfos);
    return null;
  }
  return roomInfos;
};

const handleNewMessages = async (
  newMessages: Array<OpenGroupMessageV2>,
  conversationId: string,
  _convo?: ConversationModel
) => {
  try {
    const roomInfos = await getRoomAndUpdateLastFetchTimestamp(conversationId, newMessages);
    if (!roomInfos) {
      return;
    }

    const incomingMessageIds = _.compact(newMessages.map(n => n.serverId));
    const maxNewMessageId = Math.max(...incomingMessageIds);

    const roomDetails: OpenGroupRequestCommonType = _.pick(roomInfos, 'serverUrl', 'roomId');

    // this call filters duplicates based on the sender & senttimestamp from the incoming messages array and the database
    const filteredDuplicates = await filterDuplicatesFromDbAndIncoming(newMessages);

    const startHandleOpengroupMessage = now();
    // tslint:disable-next-line: prefer-for-of
    for (let index = 0; index < filteredDuplicates.length; index++) {
      const newMessage = filteredDuplicates[index];
      try {
        await handleOpenGroupV2Message(newMessage, roomDetails);
      } catch (e) {
        window?.log?.warn('handleOpenGroupV2Message', e);
      }
    }

    window.log.debug(
      `[perf] handle ${filteredDuplicates.length} opengroupMessages took ${now() -
        startHandleOpengroupMessage}ms.`
    );

    // we need to update the timestamp even if we don't have a new MaxMessageServerId
    roomInfos.lastMessageFetchedServerID = maxNewMessageId;
    roomInfos.lastFetchTimestamp = Date.now();
    await saveV2OpenGroupRoom(roomInfos);
  } catch (e) {
    window?.log?.warn('handleNewMessages failed:', e);
  }
};

// TODO: Move to separate (v3?) openGroupAPIV3.ts
const handlePollInfoResponse = async (
  pollInfoResponseBody: {
    active_users: number;
    read: boolean;
    token: string;
    upload: boolean;
    write: boolean;
  }
  // serverUrl: string,
  // roomId: string
) => {
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
};

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

const handleCompactPollResults = async (
  serverUrl: string,
  results: Array<ParsedRoomCompactPollResults>
) => {
  await Promise.all(
    results.map(async res => {
      const convoId = getOpenGroupV2ConversationId(serverUrl, res.roomId);
      const convo = getConversationController().get(convoId);

      // we want to do deletions even if we somehow lost the convo.
      if (res.deletions.length) {
        // new deletions
        await handleDeletions(res.deletions, convoId, convo);
      }

      // new messages. call this even if we don't have new messages
      await handleNewMessages(res.messages, convoId, convo);

      if (!convo) {
        window?.log?.warn('Could not find convo for compactPoll', convoId);
        return;
      }

      // this already do the commit
      await convo.updateGroupAdmins(res.moderators, true);
    })
  );
};

const handleBase64AvatarUpdate = async (
  serverUrl: string,
  avatarResults: Array<ParsedBase64Avatar>
) => {
  await Promise.all(
    avatarResults.map(async res => {
      const convoId = getOpenGroupV2ConversationId(serverUrl, res.roomId);
      const convo = getConversationController().get(convoId);
      if (!convo) {
        window?.log?.warn('Could not find convo for compactPoll', convoId);
        return;
      }
      if (!res.base64) {
        window?.log?.info('getPreview: no base64 data. skipping');
        return;
      }
      const existingHash = convo.get('avatarHash');
      const newHash = sha256(res.base64);
      if (newHash !== existingHash) {
        // write the file to the disk (automatically encrypted),
        // ArrayBuffer

        const upgradedAttachment = await processNewAttachment({
          isRaw: true,
          data: await callUtilsWorker('fromBase64ToArrayBuffer', res.base64),
          contentType: MIME.IMAGE_UNKNOWN, // contentType is mostly used to generate previews and screenshot. We do not care for those in this case.          // url: `${serverUrl}/${res.roomId}`,
        });
        // update the hash on the conversationModel
        // this does commit to DB and UI
        await convo.setSessionProfile({
          displayName: convo.getRealSessionUsername() || window.i18n('unknown'),
          avatarPath: upgradedAttachment.path,
          avatarHash: newHash,
        });
      }
    })
  );
};

async function handleAllMemberCount(
  serverUrl: string,
  memberCountGotResults: Array<ParsedMemberCount>
) {
  if (!memberCountGotResults.length) {
    return;
  }

  await Promise.all(
    memberCountGotResults.map(async roomCount => {
      const conversationId = getOpenGroupV2ConversationId(serverUrl, roomCount.roomId);

      const convo = getConversationController().get(conversationId);
      if (!convo) {
        window?.log?.warn('cannot update conversation memberCount as it does not exist');
        return;
      }
      if (convo.get('subscriberCount') !== roomCount.memberCount) {
        convo.set({ subscriberCount: roomCount.memberCount });
        // triggers the save to db and the refresh of the UI
        await convo.commit();
      }
    })
  );
}
