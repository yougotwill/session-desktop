/* eslint-disable no-await-in-loop */
/* eslint-disable more/no-then */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { compact, concat, difference, flatten, last, sample, uniqBy } from 'lodash';
import { Data, Snode } from '../../../data/data';
import { SignalService } from '../../../protobuf';
import * as Receiver from '../../../receiver/receiver';
import { PubKey } from '../../types';
import { ERROR_CODE_NO_CONNECT } from './SNodeAPI';
import * as snodePool from './snodePool';

import { ConversationModel } from '../../../models/conversation';
import { ConversationTypeEnum } from '../../../models/conversationAttributes';
import { updateIsOnline } from '../../../state/ducks/onion';
import {
  GenericWrapperActions,
  UserGroupsWrapperActions,
} from '../../../webworker/workers/browser/libsession_worker_interface';
import { DURATION, SWARM_POLLING_TIMEOUT } from '../../constants';
import { getConversationController } from '../../conversations';
import { ed25519Str } from '../../onions/onionPath';
import { StringUtils, UserUtils } from '../../utils';
import { perfEnd, perfStart } from '../../utils/Performance';
import { LibSessionUtil } from '../../utils/libsession/libsession_utils';
import { SnodeNamespace, SnodeNamespaces } from './namespaces';
import { SnodeAPIRetrieve } from './retrieveRequest';
import { SwarmPollingGroupConfig } from './swarm_polling_config/SwarmPollingGroupConfig';
import { SwarmPollingUserConfig } from './swarm_polling_config/SwarmPollingUserConfig';
import { RetrieveMessageItem, RetrieveMessageItemWithNamespace, RetrieveMessagesResultsBatched, RetrieveRequestResult } from './types';
import { GroupPubkeyType } from 'libsession_util_nodejs';
import { assertUnreachable } from '../../../types/sqlSharedTypes';

export function extractWebSocketContent(
  message: string,
  messageHash: string
): null | {
  body: Uint8Array;
  messageHash: string;
} {
  try {
    const dataPlaintext = new Uint8Array(StringUtils.encode(message, 'base64'));
    const messageBuf = SignalService.WebSocketMessage.decode(dataPlaintext);
    if (
      messageBuf.type === SignalService.WebSocketMessage.Type.REQUEST &&
      messageBuf.request?.body?.length
    ) {
      return {
        body: messageBuf.request.body,
        messageHash,
      };
    }
    return null;
  } catch (error) {
    window?.log?.warn('extractWebSocketContent from message failed with:', error.message);
    return null;
  }
}

let instance: SwarmPolling | undefined;
export const getSwarmPollingInstance = () => {
  if (!instance) {
    instance = new SwarmPolling();
  }
  return instance;
};

type PollForUs = [pubkey: string, type: ConversationTypeEnum.PRIVATE];
type PollForLegacy = [pubkey: string, type: ConversationTypeEnum.GROUP];
type PollForGroup = [pubkey: GroupPubkeyType, type: ConversationTypeEnum.GROUPV3];


export class SwarmPolling {
  private groupPolling: Array<{ pubkey: PubKey; lastPolledTimestamp: number }>;
  private readonly lastHashes: Record<string, Record<string, Record<number, string>>>;
  private hasStarted = false;

  constructor() {
    this.groupPolling = [];
    this.lastHashes = {};
  }

  public async start(waitForFirstPoll = false): Promise<void> {
    // when restoring from seed we have to start polling before we get on the mainPage, hence this check here to make sure we do not start twice
    if (this.hasStarted) {
      return;
    }
    this.hasStarted = true;
    this.loadGroupIds();
    if (waitForFirstPoll) {
      await this.pollForAllKeys();
    } else {
      setTimeout(() => {
        void this.pollForAllKeys();
      }, 4000);
    }
  }

  /**
   * Used for testing only
   */
  public resetSwarmPolling() {
    this.groupPolling = [];
    this.hasStarted = false;
  }

  public forcePolledTimestamp(pubkey: PubKey, lastPoll: number) {
    this.groupPolling = this.groupPolling.map(group => {
      if (PubKey.isEqual(pubkey, group.pubkey)) {
        return {
          ...group,
          lastPolledTimestamp: lastPoll,
        };
      }
      return group;
    });
  }

  public addGroupId(pubkey: PubKey) {
    if (this.groupPolling.findIndex(m => m.pubkey.key === pubkey.key) === -1) {
      window?.log?.info('Swarm addGroupId: adding pubkey to polling', pubkey.key);
      this.groupPolling.push({ pubkey, lastPolledTimestamp: 0 });
    }
  }

  public removePubkey(pk: PubKey | string) {
    const pubkey = PubKey.cast(pk);
    if (this.groupPolling.some(group => pubkey.key === group.pubkey.key)) {
      window?.log?.info('Swarm removePubkey: removing pubkey from polling', pubkey.key);
      this.groupPolling = this.groupPolling.filter(group => !pubkey.isEqual(group.pubkey));
    }
  }

  /**
   * Only public for testing purpose.
   *
   * Currently, a group with an
   *  -> an activeAt less than 2 days old is considered active and polled often (every 5 sec)
   *  -> an activeAt less than 1 week old is considered medium_active and polled a bit less (every minute)
   *  -> an activeAt more than a week old is considered inactive, and not polled much (every 2 minutes)
   */
  public getPollingTimeout(convoId: PubKey) {
    const convo = getConversationController().get(convoId.key);
    if (!convo) {
      return SWARM_POLLING_TIMEOUT.INACTIVE;
    }
    const activeAt = convo.getActiveAt();
    if (!activeAt) {
      return SWARM_POLLING_TIMEOUT.INACTIVE;
    }

    const currentTimestamp = Date.now();

    // consider that this is an active group if activeAt is less than two days old
    if (currentTimestamp - activeAt <= DURATION.DAYS * 2) {
      return SWARM_POLLING_TIMEOUT.ACTIVE;
    }

    if (currentTimestamp - activeAt <= DURATION.DAYS * 7) {
      return SWARM_POLLING_TIMEOUT.MEDIUM_ACTIVE;
    }
    return SWARM_POLLING_TIMEOUT.INACTIVE;
  }

  /**
   * Only public for testing
   */
  public async pollForAllKeys() {
    if (!window.getGlobalOnlineStatus()) {
      window?.log?.error('pollForAllKeys: offline');
      // Very important to set up a new polling call so we do retry at some point
      setTimeout(this.pollForAllKeys.bind(this), SWARM_POLLING_TIMEOUT.ACTIVE);
      return;
    }
    // we always poll as often as possible for our pubkey
    const ourPubkey = UserUtils.getOurPubKeyStrFromCache();
    const directPromise = Promise.all([
      this.pollOnceForKey([ourPubkey, ConversationTypeEnum.PRIVATE]),
    ]).then(() => undefined);

    const now = Date.now();
    const groupPromises = this.groupPolling.map(async group => {
      const convoPollingTimeout = this.getPollingTimeout(group.pubkey);
      const diff = now - group.lastPolledTimestamp;
      const { key } = group.pubkey;

      const loggingId =
        getConversationController()
          .get(key)
          ?.idForLogging() || key;
      if (diff >= convoPollingTimeout) {
        window?.log?.debug(
          `Polling for ${loggingId}; timeout: ${convoPollingTimeout}; diff: ${diff} `
        );
        if (PubKey.isClosedGroupV2(key)) {
          return this.pollOnceForKey([key, ConversationTypeEnum.GROUPV3]);
        }
        return this.pollOnceForKey([key, ConversationTypeEnum.GROUP]);
      }
      window?.log?.debug(
        `Not polling for ${loggingId}; timeout: ${convoPollingTimeout} ; diff: ${diff}`
      );

      return Promise.resolve();
    });

    try {
      await Promise.all(concat([directPromise], groupPromises));
    } catch (e) {
      window?.log?.warn('pollForAllKeys exception: ', e);
      throw e;
    } finally {
      setTimeout(this.pollForAllKeys.bind(this), SWARM_POLLING_TIMEOUT.ACTIVE);
    }
  }

  /**
   * Only exposed as public for testing
   */
  public async pollOnceForKey(
    [pubkey, type]:PollForUs | PollForLegacy | PollForGroup
  ) {
    const namespaces = this.getNamespacesToPollFrom(type);

    const swarmSnodes = await snodePool.getSwarmFor(pubkey);

    // Select nodes for which we already have lastHashes
    const alreadyPolled = swarmSnodes.filter((n: Snode) => this.lastHashes[n.pubkey_ed25519]);
    let toPollFrom = alreadyPolled.length ? alreadyPolled[0] : null;

    // If we need more nodes, select randomly from the remaining nodes:
    if (!toPollFrom) {
      const notPolled = difference(swarmSnodes, alreadyPolled);
      toPollFrom = sample(notPolled) as Snode;
    }

    let resultsFromAllNamespaces: RetrieveMessagesResultsBatched | null;
    try {
      resultsFromAllNamespaces = await this.pollNodeForKey(toPollFrom, pubkey, namespaces, type);
    } catch (e) {
      window.log.warn(
        `pollNodeForKey of ${pubkey} namespaces: ${namespaces} failed with: ${e.message}`
      );
      resultsFromAllNamespaces = null;
    }

    if (!resultsFromAllNamespaces?.length) {
      // not a single message from any of the polled namespace was retrieve. nothing else to do
      return;
    }
    const { confMessages, otherMessages } = filterMessagesPerTypeOfConvo(
      type,
      resultsFromAllNamespaces
    );

    // first make sure to handle the shared user config message first
    if (
      type === ConversationTypeEnum.PRIVATE &&
      confMessages?.length &&
      UserUtils.isUsFromCache(pubkey)
    ) {
      // this does not throw, no matter what happens
      await SwarmPollingUserConfig.handleUserSharedConfigMessages(confMessages);
    } else if (
      type === ConversationTypeEnum.GROUPV3 &&
      confMessages?.length &&
      PubKey.isClosedGroupV2(pubkey)
    ) {
      await SwarmPollingGroupConfig.handleGroupSharedConfigMessages(confMessages, pubkey);
    }

    // Merge results into one list of unique messages
    const uniqOtherMsgs = uniqBy(otherMessages, x => x.hash);
    if (uniqOtherMsgs.length) {
      window.log.debug(`received otherMessages: ${otherMessages.length} for type: ${type}`);
    }

    // if all snodes returned an error (null), no need to update the lastPolledTimestamp
    if (type === ConversationTypeEnum.GROUP || type === ConversationTypeEnum.GROUPV3) {
      window?.log?.debug(
        `Polled for group(${ed25519Str(pubkey)}):, got ${uniqOtherMsgs.length} messages back.`
      );
      let lastPolledTimestamp = Date.now();
      if (uniqOtherMsgs.length >= 95) {
        // if we get 95 messages or more back, it means there are probably more than this
        // so make sure to retry the polling in the next 5sec by marking the last polled timestamp way before that it is really
        // this is a kind of hack
        lastPolledTimestamp = Date.now() - SWARM_POLLING_TIMEOUT.INACTIVE - 5 * 1000;
      }
      // update the last fetched timestamp
      this.groupPolling = this.groupPolling.map(group => {
        if (PubKey.isEqual(pubkey, group.pubkey)) {
          return {
            ...group,
            lastPolledTimestamp,
          };
        }
        return group;
      });
    }

    perfStart(`handleSeenMessages-${pubkey}`);
    const newMessages = await this.handleSeenMessages(uniqOtherMsgs);
    perfEnd(`handleSeenMessages-${pubkey}`, 'handleSeenMessages');

    // don't handle incoming messages from group swarms when the group is not one of the tracked group
    if (
      type === ConversationTypeEnum.GROUP &&
      pubkey.startsWith('05') &&
      !(await UserGroupsWrapperActions.getLegacyGroup(pubkey)) // just check if a legacy group with that name exists
    ) {
      // that pubkey is not tracked in the wrapper anymore. Just discard those messages and make sure we are not polling
      // TODOLATER we might need to do something like this for the new closed groups once released
      getSwarmPollingInstance().removePubkey(pubkey);
    } else {
      // trigger the handling of all the other messages, not shared config related
      newMessages.forEach(m => {
        const content = extractWebSocketContent(m.data, m.hash);
        if (!content) {
          return;
        }

        Receiver.handleRequest(
          content.body,
          type === ConversationTypeEnum.GROUP || type === ConversationTypeEnum.GROUPV3
            ? pubkey
            : null,
          content.messageHash
        );
      });
    }
  }

  // Fetches messages for `pubkey` from `node` potentially updating
  // the lash hash record
  private async pollNodeForKey(
    node: Snode,
    pubkey: string,
    namespaces: Array<SnodeNamespaces>,
    type: ConversationTypeEnum
  ): Promise<RetrieveMessagesResultsBatched | null> {
    const namespaceLength = namespaces.length;
    if (namespaceLength <= 0) {
      throw new Error(`invalid number of retrieve namespace provided: ${namespaceLength}`);
    }
    const snodeEdkey = node.pubkey_ed25519;

    try {
      const prevHashes = await Promise.all(
        namespaces.map(namespace => this.getLastHash(snodeEdkey, pubkey, namespace))
      );
      const configHashesToBump: Array<string> = [];

      // TODOLATER add the logic to take care of the closed groups too once we have a way to do it with the wrappers
      if (type === ConversationTypeEnum.PRIVATE) {
        for (let index = 0; index < LibSessionUtil.requiredUserVariants.length; index++) {
          const variant = LibSessionUtil.requiredUserVariants[index];
          try {
            const toBump = await GenericWrapperActions.currentHashes(variant);

            if (toBump?.length) {
              configHashesToBump.push(...toBump);
            }
          } catch (e) {
            window.log.warn(`failed to get currentHashes for user variant ${variant}`);
          }
        }
        window.log.debug(`configHashesToBump: ${configHashesToBump}`);
      } else if (type === ConversationTypeEnum.GROUPV3) {
        console.info('pollNodeForKey case bump of hashes closedgroup v3 to do ');
      }

      let results = await SnodeAPIRetrieve.retrieveNextMessages(
        node,
        prevHashes,
        pubkey,
        namespaces,
        UserUtils.getOurPubKeyStrFromCache(),
        configHashesToBump
      );

      if (!results.length) {
        return [];
      }
      // when we asked to extend the expiry of the config messages, exclude it from the list of results as we do not want to mess up the last hash tracking logic
      if (configHashesToBump.length) {
        try {
          const lastResult = results[results.length - 1];
          if (lastResult?.code !== 200) {
            // the update expiry of our config messages didn't work.
            window.log.warn(
              `the update expiry of our tracked config hashes didn't work: ${JSON.stringify(
                lastResult
              )}`
            );
          }
        } catch (e) {
          // nothing to do I suppose here.
        }
        results = results.slice(0, results.length - 1);
      }

      const lastMessages = results.map(r => {
        return last(r.messages.messages);
      });

      await Promise.all(
        lastMessages.map(async (lastMessage, index) => {
          if (!lastMessage) {
            return undefined;
          }
          return this.updateLastHash({
            edkey: snodeEdkey,
            pubkey,
            namespace: namespaces[index],
            hash: lastMessage.hash,
            expiration: lastMessage.expiration,
          });
        })
      );

      return results;
    } catch (e) {
      if (e.message === ERROR_CODE_NO_CONNECT) {
        if (window.inboxStore?.getState().onionPaths.isOnline) {
          window.inboxStore?.dispatch(updateIsOnline(false));
        }
      } else if (!window.inboxStore?.getState().onionPaths.isOnline) {
        window.inboxStore?.dispatch(updateIsOnline(true));
      }
      window?.log?.info('pollNodeForKey failed with:', e.message);
      return null;
    }
  }

  private loadGroupIds() {
    const convos = getConversationController().getConversations();

    const closedGroupsOnly = convos.filter(
      (c: ConversationModel) =>
        c.isClosedGroup() && !c.isBlocked() && !c.isKickedFromGroup() && !c.isLeft()
    );

    closedGroupsOnly.forEach((c) => {
      this.addGroupId(new PubKey(c.id));
    });
  }

  private async handleSeenMessages(
    messages: Array<RetrieveMessageItem>
  ): Promise<Array<RetrieveMessageItem>> {
    if (!messages.length) {
      return [];
    }

    const incomingHashes = messages.map((m: RetrieveMessageItem) => m.hash);

    const dupHashes = await Data.getSeenMessagesByHashList(incomingHashes);
    const newMessages = messages.filter((m: RetrieveMessageItem) => !dupHashes.includes(m.hash));

    if (newMessages.length) {
      const newHashes = newMessages.map((m: RetrieveMessageItem) => ({
        expiresAt: m.expiration,
        hash: m.hash,
      }));
      await Data.saveSeenMessageHashes(newHashes);
    }
    return newMessages;
  }


  private getNamespacesToPollFrom(type: ConversationTypeEnum): Array<SnodeNamespaces> {
    if(type === ConversationTypeEnum.PRIVATE) {
    return [
      SnodeNamespaces.Default,
      SnodeNamespaces.UserProfile,
      SnodeNamespaces.UserContacts,
      SnodeNamespaces.UserGroups,
      SnodeNamespaces.ConvoInfoVolatile,
    ] ;
    }
    if(type === ConversationTypeEnum.GROUP) {
      return [
        SnodeNamespaces.LegacyClosedGroup
      ] ;
    }
    if(type === ConversationTypeEnum.GROUPV3) {
      return [
        SnodeNamespaces.ClosedGroupMessages,
        SnodeNamespaces.ClosedGroupInfo,
        SnodeNamespaces.ClosedGroupMembers,
        SnodeNamespaces.ClosedGroupKeys, // keys are fetched last to avoid race conditions when someone deposits them
      ] ;
    }
    assertUnreachable(type, `getNamespacesToPollFrom case should have been unreachable: type:${type}`)
  }

  private async updateLastHash({
    edkey,
    expiration,
    hash,
    namespace,
    pubkey,
  }: {
    edkey: string;
    pubkey: string;
    namespace: number;
    hash: string;
    expiration: number;
  }): Promise<void> {
    const cached = await this.getLastHash(edkey, pubkey, namespace);

    if (!cached || cached !== hash) {
      await Data.updateLastHash({
        convoId: pubkey,
        snode: edkey,
        hash,
        expiresAt: expiration,
        namespace,
      });
    }

    if (!this.lastHashes[edkey]) {
      this.lastHashes[edkey] = {};
    }
    if (!this.lastHashes[edkey][pubkey]) {
      this.lastHashes[edkey][pubkey] = {};
    }
    this.lastHashes[edkey][pubkey][namespace] = hash;
  }

  private async getLastHash(nodeEdKey: string, pubkey: string, namespace: number): Promise<string> {
    if (!this.lastHashes[nodeEdKey]?.[pubkey]?.[namespace]) {
      const lastHash = await Data.getLastHashBySnode(pubkey, nodeEdKey, namespace);

      if (!this.lastHashes[nodeEdKey]) {
        this.lastHashes[nodeEdKey] = {};
      }

      if (!this.lastHashes[nodeEdKey][pubkey]) {
        this.lastHashes[nodeEdKey][pubkey] = {};
      }
      this.lastHashes[nodeEdKey][pubkey][namespace] = lastHash || '';
      return this.lastHashes[nodeEdKey][pubkey][namespace];
    }
    // return the cached value
    return this.lastHashes[nodeEdKey][pubkey][namespace];
  }
}

function retrieveItemWithNamespace(results: RetrieveRequestResult[] ) {
  return flatten(
    compact(results.map(result => result.messages.messages?.map(r => ({ ...r, namespace: result.namespace })))));
}

function filterMessagesPerTypeOfConvo<T extends ConversationTypeEnum>(
  type: T,
  retrieveResults: RetrieveMessagesResultsBatched
): { confMessages: Array<RetrieveMessageItemWithNamespace> | null; otherMessages: Array<RetrieveMessageItemWithNamespace> } {
  switch (type) {
    case ConversationTypeEnum.PRIVATE: {
      const userConfs = retrieveResults
        .filter(m => SnodeNamespace.isUserConfigNamespace(m.namespace));
      const userOthers = retrieveResults
        .filter(m => !SnodeNamespace.isUserConfigNamespace(m.namespace));

      const confMessages =
          retrieveItemWithNamespace(userConfs)

      const otherMessages =
          retrieveItemWithNamespace(userOthers)


      return { confMessages, otherMessages: uniqBy(otherMessages, x => x.hash) };
    }

    case ConversationTypeEnum.GROUP:
      return {
        confMessages: null,
        otherMessages: retrieveItemWithNamespace(retrieveResults),
      };

    case ConversationTypeEnum.GROUPV3: {

      const groupConfs = retrieveResults
      .filter(m => SnodeNamespace.isGroupConfigNamespace(m.namespace));
    const groupOthers = retrieveResults
      .filter(m => !SnodeNamespace.isGroupConfigNamespace(m.namespace));

    const groupConfMessages =
        retrieveItemWithNamespace(groupConfs)

    const groupOtherMessages =
        retrieveItemWithNamespace(groupOthers)


    return { confMessages: groupConfMessages, otherMessages: uniqBy(groupOtherMessages, x => x.hash) };

    }

    default:
      return { confMessages: null, otherMessages: [] };
  }
}
