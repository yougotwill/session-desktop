/* eslint-disable no-await-in-loop */
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  GroupInfoGet,
  GroupMemberGet,
  GroupPubkeyType,
  PubkeyType,
  Uint8ArrayLen64,
  UserGroupsGet,
  WithGroupPubkey,
  WithPubkey,
} from 'libsession_util_nodejs';
import { base64_variants, from_base64 } from 'libsodium-wrappers-sumo';
import { intersection, isEmpty, uniq } from 'lodash';
import { ConfigDumpData } from '../../data/configDump/configDump';
import { ConversationModel } from '../../models/conversation';
import { ConversationTypeEnum } from '../../models/conversationAttributes';
import { HexString } from '../../node/hexStrings';
import { SignalService } from '../../protobuf';
import { getMessageQueue } from '../../session';
import { getSwarmPollingInstance } from '../../session/apis/snode_api';
import { GetNetworkTime } from '../../session/apis/snode_api/getNetworkTime';
import { RevokeChanges, SnodeAPIRevoke } from '../../session/apis/snode_api/revokeSubaccount';
import { SnodeGroupSignature } from '../../session/apis/snode_api/signature/groupSignature';
import { WithSecretKey } from '../../session/apis/snode_api/types';
import { ConvoHub } from '../../session/conversations';
import { getSodiumRenderer } from '../../session/crypto';
import { DisappearingMessages } from '../../session/disappearing_messages';
import { ClosedGroup } from '../../session/group/closed-group';
import { GroupUpdateInfoChangeMessage } from '../../session/messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateInfoChangeMessage';
import { GroupUpdateMemberChangeMessage } from '../../session/messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateMemberChangeMessage';
import { GroupUpdateDeleteMessage } from '../../session/messages/outgoing/controlMessage/group_v2/to_user/GroupUpdateDeleteMessage';
import { PubKey } from '../../session/types';
import { UserUtils } from '../../session/utils';
import { PreConditionFailed } from '../../session/utils/errors';
import { GroupInvite } from '../../session/utils/job_runners/jobs/GroupInviteJob';
import { GroupSync } from '../../session/utils/job_runners/jobs/GroupSyncJob';
import { UserSync } from '../../session/utils/job_runners/jobs/UserSyncJob';
import { RunJobResult } from '../../session/utils/job_runners/PersistedJob';
import { LibSessionUtil } from '../../session/utils/libsession/libsession_utils';
import { getUserED25519KeyPairBytes } from '../../session/utils/User';
import { stringify, toFixedUint8ArrayOfLength } from '../../types/sqlSharedTypes';
import {
  getGroupPubkeyFromWrapperType,
  isMetaWrapperType,
} from '../../webworker/workers/browser/libsession_worker_functions';
import {
  MetaGroupWrapperActions,
  UserGroupsWrapperActions,
} from '../../webworker/workers/browser/libsession_worker_interface';
import { StateType } from '../reducer';
import { openConversationWithMessages } from './conversations';
import { resetLeftOverlayMode } from './section';

type WithAddWithoutHistoryMembers = { withoutHistory: Array<PubkeyType> };
type WithAddWithHistoryMembers = { withHistory: Array<PubkeyType> };
type WithRemoveMembers = { removed: Array<PubkeyType> };

type WithFromMemberLeftMessage = { fromMemberLeftMessage: boolean }; // there are some changes we want to skip when doing changes triggered from a memberLeft message.
export type GroupState = {
  infos: Record<GroupPubkeyType, GroupInfoGet>;
  members: Record<GroupPubkeyType, Array<GroupMemberGet>>;
  creationFromUIPending: boolean;
  memberChangesFromUIPending: boolean;
  nameChangesFromUIPending: boolean;
  membersInviteSending: Record<GroupPubkeyType, Array<PubkeyType>>;
  membersPromoteSending: Record<GroupPubkeyType, Array<PubkeyType>>;
};

export const initialGroupState: GroupState = {
  infos: {},
  members: {},
  creationFromUIPending: false,
  memberChangesFromUIPending: false,
  nameChangesFromUIPending: false,
  membersInviteSending: {},
  membersPromoteSending: {},
};

type GroupDetailsUpdate = {
  groupPk: GroupPubkeyType;
  infos: GroupInfoGet;
  members: Array<GroupMemberGet>;
};

async function checkWeAreAdmin(groupPk: GroupPubkeyType) {
  const us = UserUtils.getOurPubKeyStrFromCache();

  const usInGroup = await MetaGroupWrapperActions.memberGet(groupPk, us);
  const inUserGroup = await UserGroupsWrapperActions.getGroup(groupPk);
  // if the secretKey is not empty AND we are a member of the group, we are a current admin
  return Boolean(!isEmpty(inUserGroup?.secretKey) && usInGroup?.promoted);
}

async function checkWeAreAdminOrThrow(groupPk: GroupPubkeyType, context: string) {
  const areWeAdmin = await checkWeAreAdmin(groupPk);
  if (!areWeAdmin) {
    throw new Error(`checkWeAreAdminOrThrow failed with ctx: ${context}`);
  }
}

/**
 * Create a brand new group with a 03 prefix.
 * To be called only when our current logged in user, through the UI, creates a brand new closed group given a name and a list of members.
 *
 */
const initNewGroupInWrapper = createAsyncThunk(
  'group/initNewGroupInWrapper',
  async (
    {
      groupName,
      members,
      us,
    }: {
      groupName: string;
      members: Array<string>;
      us: string;
    },
    { dispatch }
  ): Promise<GroupDetailsUpdate> => {
    if (!members.includes(us)) {
      throw new PreConditionFailed('initNewGroupInWrapper needs us to be a member');
    }
    if (members.some(k => !PubKey.is05Pubkey(k))) {
      throw new PreConditionFailed('initNewGroupInWrapper only works with members being pubkeys');
    }
    const uniqMembers = uniq(members) as Array<PubkeyType>; // the if just above ensures that this is fine
    const newGroup = await UserGroupsWrapperActions.createGroup();
    const groupPk = newGroup.pubkeyHex;

    try {
      const groupSecretKey = newGroup.secretKey;
      if (!groupSecretKey) {
        throw new Error('groupSecretKey was empty just after creation.');
      }
      newGroup.name = groupName; // this will be used by the linked devices until they fetch the info from the groups swarm

      // the `GroupSync` below will need the secretKey of the group to be saved in the wrapper. So save it!
      await UserGroupsWrapperActions.setGroup(newGroup);
      const ourEd25519KeypairBytes = await UserUtils.getUserED25519KeyPairBytes();
      if (!ourEd25519KeypairBytes) {
        throw new Error('Current user has no priv ed25519 key?');
      }
      const userEd25519Secretkey = ourEd25519KeypairBytes.privKeyBytes;
      const groupEd2519Pk = HexString.fromHexString(groupPk).slice(1); // remove the 03 prefix (single byte once in hex form)

      // dump is always empty when creating a new groupInfo
      await MetaGroupWrapperActions.init(groupPk, {
        metaDumped: null,
        userEd25519Secretkey: toFixedUint8ArrayOfLength(userEd25519Secretkey, 64).buffer,
        groupEd25519Secretkey: newGroup.secretKey,
        groupEd25519Pubkey: toFixedUint8ArrayOfLength(groupEd2519Pk, 32).buffer,
      });

      for (let index = 0; index < uniqMembers.length; index++) {
        const member = uniqMembers[index];
        const created = await MetaGroupWrapperActions.memberGetOrConstruct(groupPk, member);
        if (created.pubkeyHex === us) {
          await MetaGroupWrapperActions.memberSetAdmin(groupPk, created.pubkeyHex);
        } else {
          await MetaGroupWrapperActions.memberSetInvited(groupPk, created.pubkeyHex, false);
        }
      }

      const infos = await MetaGroupWrapperActions.infoGet(groupPk);
      if (!infos) {
        throw new Error(`getInfos of ${groupPk} returned empty result even if it was just init.`);
      }
      infos.name = groupName;
      await MetaGroupWrapperActions.infoSet(groupPk, infos);

      const membersFromWrapper = await MetaGroupWrapperActions.memberGetAll(groupPk);
      if (!membersFromWrapper || isEmpty(membersFromWrapper)) {
        throw new Error(
          `memberGetAll of ${groupPk} returned empty result even if it was just init.`
        );
      }
      // now that we've added members to the group, make sure to make a full key rotation
      // to include them and marks the corresponding wrappers as dirty
      await MetaGroupWrapperActions.keyRekey(groupPk);

      const convo = await ConvoHub.use().getOrCreateAndWait(groupPk, ConversationTypeEnum.GROUPV2);
      await convo.setIsApproved(true, false);

      console.warn('updateMessages for new group might need an update message?');

      const result = await GroupSync.pushChangesToGroupSwarmIfNeeded({
        groupPk,
        revokeSubRequest: null,
        unrevokeSubRequest: null,
        supplementKeys: [],
      });
      if (result !== RunJobResult.Success) {
        window.log.warn('GroupSync.pushChangesToGroupSwarmIfNeeded during create failed');
        throw new Error('failed to pushChangesToGroupSwarmIfNeeded');
      }
      getSwarmPollingInstance().addGroupId(new PubKey(groupPk));

      await convo.unhideIfNeeded();
      convo.set({ active_at: Date.now() });
      await convo.commit();
      convo.updateLastMessage();
      dispatch(resetLeftOverlayMode());

      // Everything is setup for this group, we now need to send the invites to each members,
      // privately and asynchronously, and gracefully handle errors with toasts.
      // Let's do all of this part of a job to handle app crashes and make sure we
      //  can update the groupwrapper with a failed state if a message fails to be sent.
      for (let index = 0; index < membersFromWrapper.length; index++) {
        const member = membersFromWrapper[index];
        await GroupInvite.addJob({ member: member.pubkeyHex, groupPk });
      }

      await openConversationWithMessages({ conversationKey: groupPk, messageId: null });

      return { groupPk: newGroup.pubkeyHex, infos, members: membersFromWrapper };
    } catch (e) {
      window.log.warn('group creation failed. Deleting already saved datas: ', e.message);
      await UserGroupsWrapperActions.eraseGroup(groupPk);
      await MetaGroupWrapperActions.infoDestroy(groupPk);
      const foundConvo = ConvoHub.use().get(groupPk);
      if (foundConvo) {
        await ConvoHub.use().deleteClosedGroup(groupPk, {
          fromSyncMessage: false,
          sendLeaveMessage: false,
        });
      }
      throw e;
    }
  }
);

/**
 * Create a brand new group with a 03 prefix.
 * To be called only when our current logged in user, through the UI, creates a brand new closed group given a name and a list of members.
 *
 */
const handleUserGroupUpdate = createAsyncThunk(
  'group/handleUserGroupUpdate',
  async (userGroup: UserGroupsGet, payloadCreator): Promise<GroupDetailsUpdate> => {
    // if we already have a state for that group here, it means that group was already init, and the data should come from the groupInfos after.
    const state = payloadCreator.getState() as StateType;
    const groupPk = userGroup.pubkeyHex;
    if (state.groups.infos[groupPk] && state.groups.members[groupPk]) {
      window.log.info('handleUserGroupUpdate group already present in redux slice');
      return {
        groupPk,
        infos: await MetaGroupWrapperActions.infoGet(groupPk),
        members: await MetaGroupWrapperActions.memberGetAll(groupPk),
      };
    }

    const ourEd25519KeypairBytes = await UserUtils.getUserED25519KeyPairBytes();
    if (!ourEd25519KeypairBytes) {
      throw new Error('Current user has no priv ed25519 key?');
    }
    const userEd25519Secretkey = ourEd25519KeypairBytes.privKeyBytes;
    const groupEd2519Pk = HexString.fromHexString(groupPk).slice(1); // remove the 03 prefix (single byte once in hex form)

    // dump is always empty when creating a new groupInfo
    try {
      await MetaGroupWrapperActions.init(groupPk, {
        metaDumped: null,
        userEd25519Secretkey: toFixedUint8ArrayOfLength(userEd25519Secretkey, 64).buffer,
        groupEd25519Secretkey: userGroup.secretKey,
        groupEd25519Pubkey: toFixedUint8ArrayOfLength(groupEd2519Pk, 32).buffer,
      });
    } catch (e) {
      window.log.warn(`failed to init metawrapper ${groupPk}`);
    }

    const convo = await ConvoHub.use().getOrCreateAndWait(groupPk, ConversationTypeEnum.GROUPV2);

    await convo.setIsApproved(true, false);

    await convo.setPriorityFromWrapper(userGroup.priority, false);
    convo.set({
      active_at: Date.now(),
      displayNameInProfile: userGroup.name || undefined,
    });
    await convo.commit();

    return {
      groupPk,
      infos: await MetaGroupWrapperActions.infoGet(groupPk),
      members: await MetaGroupWrapperActions.memberGetAll(groupPk),
    };
  }
);

/**
 * Called only when the app just loaded the SessionInbox (i.e. user logged in and fully loaded).
 * This function populates the slice with any meta-dumps we have in the DB, if they also are part of what is the usergroup wrapper tracking.
 *
 */
const loadMetaDumpsFromDB = createAsyncThunk(
  'group/loadMetaDumpsFromDB',
  async (): Promise<Array<GroupDetailsUpdate>> => {
    const ed25519KeyPairBytes = await getUserED25519KeyPairBytes();
    if (!ed25519KeyPairBytes?.privKeyBytes) {
      throw new Error('user has no ed25519KeyPairBytes.');
    }

    const variantsWithData = await ConfigDumpData.getAllDumpsWithData();
    const allUserGroups = await UserGroupsWrapperActions.getAllGroups();
    const toReturn: Array<GroupDetailsUpdate> = [];
    for (let index = 0; index < variantsWithData.length; index++) {
      const { variant, data } = variantsWithData[index];
      if (!isMetaWrapperType(variant)) {
        continue;
      }
      const groupPk = getGroupPubkeyFromWrapperType(variant);
      const groupEd25519Pubkey = HexString.fromHexString(groupPk.substring(2));
      const foundInUserWrapper = allUserGroups.find(m => m.pubkeyHex === groupPk);
      if (!foundInUserWrapper) {
        try {
          window.log.info(
            'metaGroup not found in userGroups. Deleting the corresponding dumps:',
            groupPk
          );

          await ConfigDumpData.deleteDumpFor(groupPk);
        } catch (e) {
          window.log.warn(`ConfigDumpData.deleteDumpFor for ${groupPk} failed with `, e.message);
        }
        continue;
      }

      try {
        window.log.debug('loadMetaDumpsFromDB initing from metagroup dump', variant);

        await MetaGroupWrapperActions.init(groupPk, {
          groupEd25519Pubkey: toFixedUint8ArrayOfLength(groupEd25519Pubkey, 32).buffer,
          groupEd25519Secretkey: foundInUserWrapper?.secretKey || null,
          userEd25519Secretkey: toFixedUint8ArrayOfLength(ed25519KeyPairBytes.privKeyBytes, 64)
            .buffer,
          metaDumped: data,
        });

        const infos = await MetaGroupWrapperActions.infoGet(groupPk);
        const members = await MetaGroupWrapperActions.memberGetAll(groupPk);

        toReturn.push({ groupPk, infos, members });
      } catch (e) {
        // Note: Don't retrow here, we want to load everything we can
        window.log.error(
          `initGroup of Group wrapper of variant ${variant} failed with ${e.message} `
        );
      }
    }

    return toReturn;
  }
);

/**
 * This action is to be called when we get a merge event from the network.
 * It refreshes the state of that particular group (info & members) with the state from the wrapper after the merge is done.
 *
 */
const refreshGroupDetailsFromWrapper = createAsyncThunk(
  'group/refreshGroupDetailsFromWrapper',
  async ({
    groupPk,
  }: {
    groupPk: GroupPubkeyType;
  }): Promise<
    GroupDetailsUpdate | ({ groupPk: GroupPubkeyType } & Partial<GroupDetailsUpdate>)
  > => {
    try {
      const infos = await MetaGroupWrapperActions.infoGet(groupPk);
      const members = await MetaGroupWrapperActions.memberGetAll(groupPk);

      return { groupPk, infos, members };
    } catch (e) {
      window.log.warn('refreshGroupDetailsFromWrapper failed with ', e.message);
      return { groupPk };
    }
  }
);

const destroyGroupDetails = createAsyncThunk(
  'group/destroyGroupDetails',
  async ({ groupPk }: { groupPk: GroupPubkeyType }) => {
    try {
      await UserGroupsWrapperActions.eraseGroup(groupPk);
      await ConfigDumpData.deleteDumpFor(groupPk);
      await MetaGroupWrapperActions.infoDestroy(groupPk);
      getSwarmPollingInstance().removePubkey(groupPk, 'destroyGroupDetails');
    } catch (e) {
      window.log.warn(`destroyGroupDetails for ${groupPk} failed with ${e.message}`);
    }
    return { groupPk };
  }
);

function validateMemberAddChange({
  groupPk,
  withHistory: addMembersWithHistory,
  withoutHistory: addMembersWithoutHistory,
}: WithGroupPubkey & WithAddWithoutHistoryMembers & WithAddWithHistoryMembers) {
  const us = UserUtils.getOurPubKeyStrFromCache();
  if (addMembersWithHistory.includes(us) || addMembersWithoutHistory.includes(us)) {
    throw new PreConditionFailed(
      'currentDeviceGroupMembersChange cannot be used for changes of our own state in the group'
    );
  }

  const withHistory = uniq(addMembersWithHistory);
  const withoutHistory = uniq(addMembersWithoutHistory);
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    throw new PreConditionFailed('currentDeviceGroupMembersChange convo not present in convohub');
  }
  if (intersection(withHistory, withoutHistory).length) {
    throw new Error(
      'withHistory and withoutHistory can only have values which are not in the other'
    );
  }

  return { withoutHistory, withHistory, us, convo };
}

function validateMemberRemoveChange({
  groupPk,
  removed: removeMembers,
}: WithGroupPubkey & WithRemoveMembers) {
  const us = UserUtils.getOurPubKeyStrFromCache();
  if (removeMembers.includes(us)) {
    throw new PreConditionFailed(
      'currentDeviceGroupMembersChange cannot be used for changes of our own state in the group'
    );
  }

  const removed = uniq(removeMembers);
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    throw new PreConditionFailed('currentDeviceGroupMembersChange convo not present in convohub');
  }

  return { removed, us, convo };
}

function validateNameChange({
  groupPk,
  newName,
  currentName,
}: WithGroupPubkey & { newName: string; currentName: string }) {
  const us = UserUtils.getOurPubKeyStrFromCache();
  if (!newName || isEmpty(newName)) {
    throw new PreConditionFailed('validateNameChange needs a non empty name');
  }

  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    throw new PreConditionFailed('validateNameChange convo not present in convohub');
  }
  if (newName === currentName) {
    throw new PreConditionFailed('validateNameChange no name change detected');
  }

  return { newName, us, convo };
}

/**
 * Update the GROUP_MEMBER wrapper state to have those members.
 * @returns the supplementalKeys to be pushed
 */
async function handleWithHistoryMembers({
  groupPk,
  withHistory,
}: WithGroupPubkey & {
  withHistory: Array<PubkeyType>;
}) {
  for (let index = 0; index < withHistory.length; index++) {
    const member = withHistory[index];
    const created = await MetaGroupWrapperActions.memberGetOrConstruct(groupPk, member);
    await MetaGroupWrapperActions.memberSetInvited(groupPk, created.pubkeyHex, false);
  }
  const supplementKeys = withHistory.length
    ? await MetaGroupWrapperActions.generateSupplementKeys(groupPk, withHistory)
    : [];
  return supplementKeys;
}

/**
 * Update the GROUP_MEMBER wrapper state to have those members.
 * Calls rekey() if at least one was present in the list.
 */
async function handleWithoutHistoryMembers({
  groupPk,
  withoutHistory,
}: WithGroupPubkey & WithAddWithoutHistoryMembers) {
  for (let index = 0; index < withoutHistory.length; index++) {
    const member = withoutHistory[index];
    const created = await MetaGroupWrapperActions.memberGetOrConstruct(groupPk, member);
    await MetaGroupWrapperActions.memberSetInvited(groupPk, created.pubkeyHex, false);
  }

  if (!isEmpty(withoutHistory)) {
    await MetaGroupWrapperActions.keyRekey(groupPk);
  }
}

/**
 * Send the GroupUpdateDeleteMessage encrypted with an encryption keypair that the removed members should have.
 * Then, send that message to the namespace ClosedGroupRevokedRetrievableMessages.
 * If that worked, remove the member from the metagroup wrapper, and rekey it.
 * Any new messages encrypted with that wrapper won't be readable by the removed members, so we **have** to send it before we rekey().
 *
 */
async function handleRemoveMembersAndRekey({
  groupPk,
  removed,
  secretKey,
  fromMemberLeftMessage,
}: WithGroupPubkey & WithRemoveMembers & WithFromMemberLeftMessage & { secretKey: Uint8Array }) {
  if (!removed.length) {
    return;
  }
  const createAtNetworkTimestamp = GetNetworkTime.now();
  const sortedRemoved = removed.sort();

  // TODO implement the GroupUpdateDeleteMessage multi_encrypt_simple on chunk3 debugger
  if (!fromMemberLeftMessage && false) {
    // We need to sign that message with the current admin key
    const adminSignature = await SnodeGroupSignature.signDataWithAdminSecret(
      `DELETE${createAtNetworkTimestamp}${sortedRemoved.join('')}`,
      { secretKey }
    );

    // We need to encrypt this message with the the current encryptionKey, before we call rekey()
    const removedMemberMessage = new GroupUpdateDeleteMessage({
      groupPk,
      createAtNetworkTimestamp,
      adminSignature: from_base64(adminSignature.signature, base64_variants.ORIGINAL),
      expirationType: null, // that message is not stored in DB and so don't have to disappear at all.
      expireTimer: null,
      memberSessionIds: sortedRemoved,
    });

    const result = await getMessageQueue().sendToGroupV2NonDurably({
      message: removedMemberMessage,
    });
    if (!result) {
      throw new Error(
        'Failed to send GroupUpdateDeleteMessage to ClosedGroupRevokedRetrievableMessages namespace'
      );
    }
  }
  // Note: we need to rekey only once the GroupUpdateDeleteMessage is sent because
  // otherwise removed members won't be able to decrypt it (as rekey is called after erase)
  await MetaGroupWrapperActions.memberEraseAndRekey(groupPk, sortedRemoved);
}

async function getPendingRevokeParams({
  withoutHistory,
  withHistory,
  removed,
  groupPk,
  secretKey,
}: WithGroupPubkey &
  WithSecretKey &
  WithAddWithoutHistoryMembers &
  WithAddWithHistoryMembers &
  WithRemoveMembers) {
  const revokeChanges: RevokeChanges = [];
  const unrevokeChanges: RevokeChanges = [];

  for (let index = 0; index < withoutHistory.length; index++) {
    const m = withoutHistory[index];
    const token = await MetaGroupWrapperActions.swarmSubAccountToken(groupPk, m);
    unrevokeChanges.push({ action: 'unrevoke_subaccount', tokenToRevokeHex: token });
  }
  for (let index = 0; index < withHistory.length; index++) {
    const m = withHistory[index];
    const token = await MetaGroupWrapperActions.swarmSubAccountToken(groupPk, m);
    unrevokeChanges.push({ action: 'unrevoke_subaccount', tokenToRevokeHex: token });
  }
  for (let index = 0; index < removed.length; index++) {
    const m = removed[index];
    const token = await MetaGroupWrapperActions.swarmSubAccountToken(groupPk, m);
    revokeChanges.push({ action: 'revoke_subaccount', tokenToRevokeHex: token });
  }

  return SnodeAPIRevoke.getRevokeSubaccountParams(groupPk, secretKey, {
    revokeChanges,
    unrevokeChanges,
  });
}

function getConvoExpireDetailsForMsg(convo: ConversationModel) {
  const expireTimer = convo.getExpireTimer();
  const expireDetails = {
    expirationType: DisappearingMessages.changeToDisappearingMessageType(
      convo,
      expireTimer,
      convo.getExpirationMode()
    ),
    expireTimer,
  };
  return expireDetails;
}

/**
 * Return the control messages to be pushed to the group's swarm.
 * Those are not going to change the state, they are just here as a "notification".
 * i.e. "Alice was removed from the group"
 */
async function getRemovedControlMessage({
  convo,
  groupPk,
  removed,
  adminSecretKey,
  createAtNetworkTimestamp,
  fromMemberLeftMessage,
  dbMsgIdentifier,
}: WithFromMemberLeftMessage &
  WithRemoveMembers &
  WithGroupPubkey & {
    convo: ConversationModel;
    adminSecretKey: Uint8ArrayLen64;
    createAtNetworkTimestamp: number;
    dbMsgIdentifier: string;
  }) {
  const sodium = await getSodiumRenderer();

  if (fromMemberLeftMessage || !removed.length) {
    return null;
  }

  return new GroupUpdateMemberChangeMessage({
    identifier: dbMsgIdentifier,
    removed,
    groupPk,
    typeOfChange: 'removed',
    createAtNetworkTimestamp,
    secretKey: adminSecretKey,
    sodium,
    ...getConvoExpireDetailsForMsg(convo),
  });
}

async function getWithoutHistoryControlMessage({
  convo,
  withoutHistory,
  groupPk,
  adminSecretKey,
  createAtNetworkTimestamp,
  dbMsgIdentifier,
}: WithAddWithoutHistoryMembers &
  WithGroupPubkey & {
    dbMsgIdentifier: string;
    convo: ConversationModel;
    adminSecretKey: Uint8ArrayLen64;
    createAtNetworkTimestamp: number;
  }) {
  const sodium = await getSodiumRenderer();

  if (!withoutHistory.length) {
    return null;
  }

  return new GroupUpdateMemberChangeMessage({
    identifier: dbMsgIdentifier,
    added: withoutHistory,
    groupPk,
    typeOfChange: 'added',
    createAtNetworkTimestamp,
    secretKey: adminSecretKey,
    sodium,
    ...getConvoExpireDetailsForMsg(convo),
  });
}

async function getWithHistoryControlMessage({
  convo,
  withHistory,
  groupPk,
  adminSecretKey,
  createAtNetworkTimestamp,
  dbMsgIdentifier,
}: WithAddWithHistoryMembers &
  WithGroupPubkey & {
    dbMsgIdentifier: string;
    convo: ConversationModel;
    adminSecretKey: Uint8ArrayLen64;
    createAtNetworkTimestamp: number;
  }) {
  const sodium = await getSodiumRenderer();

  if (!withHistory.length) {
    return null;
  }

  return new GroupUpdateMemberChangeMessage({
    identifier: dbMsgIdentifier,
    added: withHistory,
    groupPk,
    typeOfChange: 'addedWithHistory',
    createAtNetworkTimestamp,
    secretKey: adminSecretKey,
    sodium,
    ...getConvoExpireDetailsForMsg(convo),
  });
}

async function handleMemberAddedFromUI({
  addMembersWithHistory,
  addMembersWithoutHistory,
  groupPk,
}: WithGroupPubkey & {
  addMembersWithHistory: Array<PubkeyType>;
  addMembersWithoutHistory: Array<PubkeyType>;
}) {
  const group = await UserGroupsWrapperActions.getGroup(groupPk);
  if (!group || !group.secretKey || isEmpty(group.secretKey)) {
    throw new Error('tried to make change to group but we do not have the admin secret key');
  }

  await checkWeAreAdminOrThrow(groupPk, 'handleMemberAddedFromUIOrNot');

  const { withHistory, withoutHistory, convo, us } = validateMemberAddChange({
    withHistory: addMembersWithHistory,
    withoutHistory: addMembersWithoutHistory,
    groupPk,
  });
  // first, get the unrevoke requests for people who are added
  const revokeUnrevokeParams = await getPendingRevokeParams({
    groupPk,
    withHistory,
    withoutHistory,
    removed: [],
    secretKey: group.secretKey,
  });

  // then, handle the addition with history of messages by generating supplement keys.
  // this adds them to the members wrapper etc
  const supplementKeys = await handleWithHistoryMembers({ groupPk, withHistory });

  // then handle the addition without history of messages (full rotation of keys).
  // this adds them to the members wrapper etc
  await handleWithoutHistoryMembers({ groupPk, withoutHistory });
  const createAtNetworkTimestamp = GetNetworkTime.now();

  await LibSessionUtil.saveDumpsToDb(groupPk);

  // push new members & key supplement in a single batch call
  const sequenceResult = await GroupSync.pushChangesToGroupSwarmIfNeeded({
    groupPk,
    supplementKeys,
    ...revokeUnrevokeParams,
  });
  if (sequenceResult !== RunJobResult.Success) {
    throw new Error(
      'handleMemberAddedFromUIOrNot: pushChangesToGroupSwarmIfNeeded did not return success'
    );
  }

  // schedule send invite details, auth signature, etc. to the new users
  await scheduleGroupInviteJobs(groupPk, withHistory, withoutHistory);
  await LibSessionUtil.saveDumpsToDb(groupPk);

  convo.set({
    active_at: createAtNetworkTimestamp,
  });

  const expiringDetails = getConvoExpireDetailsForMsg(convo);

  const shared = {
    convo,
    sender: us,
    sentAt: createAtNetworkTimestamp,
    expireUpdate: {
      expirationTimer: expiringDetails.expireTimer,
      expirationType: expiringDetails.expirationType,
      messageExpirationFromRetrieve:
        expiringDetails.expireTimer > 0
          ? createAtNetworkTimestamp + expiringDetails.expireTimer
          : null,
    },
  };

  const updateMessagesToPush: Array<GroupUpdateMemberChangeMessage> = [];
  if (withHistory.length) {
    const msgModel = await ClosedGroup.addUpdateMessage({
      diff: { type: 'add', added: withHistory, withHistory: true },
      ...shared,
    });
    const groupChange = await getWithHistoryControlMessage({
      adminSecretKey: group.secretKey,
      convo,
      groupPk,
      withHistory,
      createAtNetworkTimestamp,
      dbMsgIdentifier: msgModel.id,
    });
    if (groupChange) {
      updateMessagesToPush.push(groupChange);
    }
  }
  if (withoutHistory.length) {
    const msgModel = await ClosedGroup.addUpdateMessage({
      diff: { type: 'add', added: withoutHistory, withHistory: false },
      ...shared,
    });
    const groupChange = await getWithoutHistoryControlMessage({
      adminSecretKey: group.secretKey,
      convo,
      groupPk,
      withoutHistory,
      createAtNetworkTimestamp,
      dbMsgIdentifier: msgModel.id,
    });
    if (groupChange) {
      updateMessagesToPush.push(groupChange);
    }
    console.warn(`diff: { type: ' should add case for addWithHistory here ?`);
  }

  await convo.commit();
  await GroupSync.storeGroupUpdateMessages({ groupPk, updateMessages: updateMessagesToPush });
}

/**
 * This function is called in two cases:
 * - to udpate the state when kicking a member from the group from the UI
 * - to update the state when handling a MEMBER_LEFT message
 */
async function handleMemberRemovedFromUI({
  groupPk,
  removeMembers,
  fromMemberLeftMessage,
}: WithFromMemberLeftMessage &
  WithGroupPubkey & {
    removeMembers: Array<PubkeyType>;
  }) {
  const group = await UserGroupsWrapperActions.getGroup(groupPk);
  if (!group || !group.secretKey || isEmpty(group.secretKey)) {
    throw new Error('tried to make change to group but we do not have the admin secret key');
  }

  await checkWeAreAdminOrThrow(groupPk, 'handleMemberRemovedFromUI');

  if (removeMembers.length === 0) {
    return;
  }

  const { removed, convo, us } = validateMemberRemoveChange({
    groupPk,
    removed: removeMembers,
  });
  // first, get revoke requests that need to be pushed for leaving member
  const revokeUnrevokeParams = await getPendingRevokeParams({
    groupPk,
    withHistory: [],
    withoutHistory: [],
    removed,
    secretKey: group.secretKey,
  });

  // Send the groupUpdateDeleteMessage that can still be decrypted by those removed members to namespace ClosedGroupRevokedRetrievableMessages. (not when handling a MEMBER_LEFT message)
  // Then, rekey the wrapper, but don't push the changes yet, we want to batch all of the requests to be made together in the `pushChangesToGroupSwarmIfNeeded` below.
  await handleRemoveMembersAndRekey({
    groupPk,
    removed,
    secretKey: group.secretKey,
    fromMemberLeftMessage,
  });

  const createAtNetworkTimestamp = GetNetworkTime.now();

  await LibSessionUtil.saveDumpsToDb(groupPk);

  // revoked pubkeys, update messages, and libsession groups config in a single batchcall
  const sequenceResult = await GroupSync.pushChangesToGroupSwarmIfNeeded({
    groupPk,
    supplementKeys: [],
    ...revokeUnrevokeParams,
  });
  if (sequenceResult !== RunJobResult.Success) {
    throw new Error(
      'currentDeviceGroupMembersChange: pushChangesToGroupSwarmIfNeeded did not return success'
    );
  }

  await LibSessionUtil.saveDumpsToDb(groupPk);

  convo.set({
    active_at: createAtNetworkTimestamp,
  });

  const expiringDetails = getConvoExpireDetailsForMsg(convo);

  const shared = {
    convo,
    sender: us,
    sentAt: createAtNetworkTimestamp,
    expireUpdate: {
      expirationTimer: expiringDetails.expireTimer,
      expirationType: expiringDetails.expirationType,
      messageExpirationFromRetrieve:
        expiringDetails.expireTimer > 0
          ? createAtNetworkTimestamp + expiringDetails.expireTimer
          : null,
    },
  };
  await convo.commit();

  if (removed.length) {
    const msgModel = await ClosedGroup.addUpdateMessage({
      diff: { type: 'kicked', kicked: removed },
      ...shared,
    });
    const removedControlMessage = await getRemovedControlMessage({
      adminSecretKey: group.secretKey,
      convo,
      groupPk,
      removed,
      createAtNetworkTimestamp,
      fromMemberLeftMessage,
      dbMsgIdentifier: msgModel.id,
    });
    if (removedControlMessage) {
      await GroupSync.storeGroupUpdateMessages({
        groupPk,
        updateMessages: [removedControlMessage],
      });
    }
  }
}

async function handleNameChangeFromUI({
  groupPk,
  newName: uncheckedName,
}: WithGroupPubkey & {
  newName: string;
}) {
  const group = await UserGroupsWrapperActions.getGroup(groupPk);
  if (!group || !group.secretKey || isEmpty(group.secretKey)) {
    throw new Error('tried to make change to group but we do not have the admin secret key');
  }
  const infos = await MetaGroupWrapperActions.infoGet(groupPk);
  if (!infos) {
    throw new PreConditionFailed('nameChange infoGet is empty');
  }

  await checkWeAreAdminOrThrow(groupPk, 'handleNameChangeFromUIOrNot');

  // this throws if the name is the same, or empty
  const { newName, convo, us } = validateNameChange({
    newName: uncheckedName,
    currentName: group.name || '',
    groupPk,
  });

  group.name = newName;
  infos.name = newName;
  await UserGroupsWrapperActions.setGroup(group);
  await MetaGroupWrapperActions.infoSet(groupPk, infos);
  const createAtNetworkTimestamp = GetNetworkTime.now();

  // we want to add an update message even if the change was done remotely
  const msg = await ClosedGroup.addUpdateMessage({
    convo,
    diff: { type: 'name', newName },
    sender: us,
    sentAt: createAtNetworkTimestamp,
    expireUpdate: null,
  });

  // we want to send an update only if the change was made locally.
  const nameChangeMsg = new GroupUpdateInfoChangeMessage({
    groupPk,
    typeOfChange: SignalService.GroupUpdateInfoChangeMessage.Type.NAME,
    updatedName: newName,
    identifier: msg.id,
    createAtNetworkTimestamp,
    secretKey: group.secretKey,
    sodium: await getSodiumRenderer(),
    ...getConvoExpireDetailsForMsg(convo),
  });

  const batchResult = await GroupSync.pushChangesToGroupSwarmIfNeeded({
    groupPk,
    supplementKeys: [],
    revokeSubRequest: null,
    unrevokeSubRequest: null,
  });

  if (batchResult !== RunJobResult.Success) {
    throw new Error(
      'handleNameChangeFromUIOrNot: pushChangesToGroupSwarmIfNeeded did not return success'
    );
  }

  await UserSync.queueNewJobIfNeeded();
  await GroupSync.storeGroupUpdateMessages({ groupPk, updateMessages: [nameChangeMsg] });

  convo.set({
    active_at: createAtNetworkTimestamp,
  });
  await convo.commit();
}

/**
 * This action is used to trigger a change when the local user does a change to a group v2 members list.
 * GroupV2 added members can be added two ways: with and without the history of messages.
 * GroupV2 removed members have their subaccount token revoked on the server side so they cannot poll anymore from the group's swarm.
 */
const currentDeviceGroupMembersChange = createAsyncThunk(
  'group/currentDeviceGroupMembersChange',
  async (
    {
      groupPk,
      ...args
    }: {
      groupPk: GroupPubkeyType;
      addMembersWithHistory: Array<PubkeyType>;
      addMembersWithoutHistory: Array<PubkeyType>;
      removeMembers: Array<PubkeyType>;
    },
    payloadCreator
  ): Promise<GroupDetailsUpdate> => {
    const state = payloadCreator.getState() as StateType;
    if (!state.groups.infos[groupPk] || !state.groups.members[groupPk]) {
      throw new PreConditionFailed(
        'currentDeviceGroupMembersChange group not present in redux slice'
      );
    }

    await handleMemberRemovedFromUI({
      groupPk,
      removeMembers: args.removeMembers,
      fromMemberLeftMessage: false,
    });

    await handleMemberAddedFromUI({
      groupPk,
      addMembersWithHistory: args.addMembersWithHistory,
      addMembersWithoutHistory: args.addMembersWithoutHistory,
    });

    return {
      groupPk,
      infos: await MetaGroupWrapperActions.infoGet(groupPk),
      members: await MetaGroupWrapperActions.memberGetAll(groupPk),
    };
  }
);

/**
 * This action is used to trigger a change when the local user does a change to a group v2 members list.
 * GroupV2 added members can be added two ways: with and without the history of messages.
 * GroupV2 removed members have their subaccount token revoked on the server side so they cannot poll anymore from the group's swarm.
 */
const handleMemberLeftMessage = createAsyncThunk(
  'group/handleMemberLeftMessage',
  async (
    {
      groupPk,
      memberLeft,
    }: {
      groupPk: GroupPubkeyType;
      memberLeft: PubkeyType;
    },
    payloadCreator
  ): Promise<GroupDetailsUpdate> => {
    const state = payloadCreator.getState() as StateType;
    if (!state.groups.infos[groupPk] || !state.groups.members[groupPk]) {
      throw new PreConditionFailed(
        'currentDeviceGroupMembersChange group not present in redux slice'
      );
    }

    await handleMemberRemovedFromUI({
      groupPk,
      removeMembers: [memberLeft],
      fromMemberLeftMessage: true,
    });

    return {
      groupPk,
      infos: await MetaGroupWrapperActions.infoGet(groupPk),
      members: await MetaGroupWrapperActions.memberGetAll(groupPk),
    };
  }
);

const markUsAsAdmin = createAsyncThunk(
  'group/markUsAsAdmin',
  async (
    {
      groupPk,
      secret,
    }: {
      groupPk: GroupPubkeyType;
      secret: Uint8ArrayLen64;
    },
    payloadCreator
  ): Promise<GroupDetailsUpdate> => {
    const state = payloadCreator.getState() as StateType;
    if (!state.groups.infos[groupPk] || !state.groups.members[groupPk]) {
      throw new PreConditionFailed('markUsAsAdmin group not present in redux slice');
    }
    if (secret.length !== 64) {
      throw new PreConditionFailed('markUsAsAdmin secret needs to be 64');
    }
    await MetaGroupWrapperActions.loadAdminKeys(groupPk, secret);
    const us = UserUtils.getOurPubKeyStrFromCache();

    if (state.groups.members[groupPk].find(m => m.pubkeyHex === us)?.admin) {
      // we are already an admin, nothing to do
      return {
        groupPk,
        infos: await MetaGroupWrapperActions.infoGet(groupPk),
        members: await MetaGroupWrapperActions.memberGetAll(groupPk),
      };
    }
    await MetaGroupWrapperActions.memberSetAdmin(groupPk, us);

    await GroupSync.queueNewJobIfNeeded(groupPk);

    return {
      groupPk,
      infos: await MetaGroupWrapperActions.infoGet(groupPk),
      members: await MetaGroupWrapperActions.memberGetAll(groupPk),
    };
  }
);

const inviteResponseReceived = createAsyncThunk(
  'group/inviteResponseReceived',
  async (
    {
      groupPk,
      member,
    }: {
      groupPk: GroupPubkeyType;
      member: PubkeyType;
    },
    payloadCreator
  ): Promise<GroupDetailsUpdate> => {
    const state = payloadCreator.getState() as StateType;
    if (!state.groups.infos[groupPk] || !state.groups.members[groupPk]) {
      throw new PreConditionFailed('inviteResponseReceived group but not present in redux slice');
    }
    try {
      await checkWeAreAdminOrThrow(groupPk, 'inviteResponseReceived');

      await MetaGroupWrapperActions.memberSetAccepted(groupPk, member);
      await GroupSync.queueNewJobIfNeeded(groupPk);
    } catch (e) {
      window.log.info('inviteResponseReceived failed with', e.message);
      // only admins can do the steps above, but we don't want to throw if we are not an admin
    }

    return {
      groupPk,
      infos: await MetaGroupWrapperActions.infoGet(groupPk),
      members: await MetaGroupWrapperActions.memberGetAll(groupPk),
    };
  }
);

const currentDeviceGroupNameChange = createAsyncThunk(
  'group/currentDeviceGroupNameChange',
  async (
    {
      groupPk,
      ...args
    }: {
      groupPk: GroupPubkeyType;
      newName: string;
    },
    payloadCreator
  ): Promise<GroupDetailsUpdate> => {
    const state = payloadCreator.getState() as StateType;
    if (!state.groups.infos[groupPk] || !state.groups.members[groupPk]) {
      throw new PreConditionFailed('currentDeviceGroupNameChange group not present in redux slice');
    }
    await checkWeAreAdminOrThrow(groupPk, 'currentDeviceGroupNameChange');

    await handleNameChangeFromUI({ groupPk, ...args });

    return {
      groupPk,
      infos: await MetaGroupWrapperActions.infoGet(groupPk),
      members: await MetaGroupWrapperActions.memberGetAll(groupPk),
    };
  }
);

function deleteGroupPkEntriesFromState(state: GroupState, groupPk: GroupPubkeyType) {
  delete state.infos[groupPk];
  delete state.members[groupPk];
  delete state.membersInviteSending[groupPk];
  delete state.membersPromoteSending[groupPk];
}

function applySendingStateChange({
  groupPk,
  pubkey,
  sending,
  state,
  changeType,
}: WithGroupPubkey &
  WithPubkey & { sending: boolean; changeType: 'invite' | 'promote'; state: GroupState }) {
  if (changeType === 'invite' && !state.membersInviteSending[groupPk]) {
    state.membersInviteSending[groupPk] = [];
  } else if (changeType === 'promote' && !state.membersPromoteSending[groupPk]) {
    state.membersPromoteSending[groupPk] = [];
  }
  const arrRef =
    changeType === 'invite'
      ? state.membersInviteSending[groupPk]
      : state.membersPromoteSending[groupPk];

  const foundAt = arrRef.findIndex(p => p === pubkey);

  if (sending && foundAt === -1) {
    arrRef.push(pubkey);
    return state;
  }
  if (!sending && foundAt >= 0) {
    arrRef.splice(foundAt, 1);
  }
  return state;
}

/**
 * This slice is the one holding the default joinable rooms fetched once in a while from the default opengroup v2 server.
 */
const metaGroupSlice = createSlice({
  name: 'metaGroup',
  initialState: initialGroupState,
  reducers: {
    setInvitePending(
      state: GroupState,
      { payload }: PayloadAction<{ sending: boolean } & WithGroupPubkey & WithPubkey>
    ) {
      return applySendingStateChange({ changeType: 'invite', ...payload, state });
    },

    setPromotionPending(
      state: GroupState,
      { payload }: PayloadAction<{ pubkey: PubkeyType; groupPk: GroupPubkeyType; sending: boolean }>
    ) {
      return applySendingStateChange({ changeType: 'promote', ...payload, state });
    },
  },
  extraReducers: builder => {
    builder.addCase(initNewGroupInWrapper.fulfilled, (state, action) => {
      const { groupPk, infos, members } = action.payload;
      state.infos[groupPk] = infos;
      state.members[groupPk] = members;
      state.creationFromUIPending = false;
      return state;
    });
    builder.addCase(initNewGroupInWrapper.rejected, (state, action) => {
      window.log.error('a initNewGroupInWrapper was rejected', action.error);
      state.creationFromUIPending = false;
      return state;
      // FIXME delete the wrapper completely & corresponding dumps, and usergroups entry?
    });
    builder.addCase(initNewGroupInWrapper.pending, (state, _action) => {
      state.creationFromUIPending = true;

      window.log.error('a initNewGroupInWrapper is pending');
      return state;
    });
    builder.addCase(loadMetaDumpsFromDB.fulfilled, (state, action) => {
      const loaded = action.payload;
      loaded.forEach(element => {
        state.infos[element.groupPk] = element.infos;
        state.members[element.groupPk] = element.members;
      });
      return state;
    });
    builder.addCase(loadMetaDumpsFromDB.rejected, (state, action) => {
      window.log.error('a loadMetaDumpsFromDB was rejected', action.error);
      return state;
    });
    builder.addCase(refreshGroupDetailsFromWrapper.fulfilled, (state, action) => {
      const { infos, members, groupPk } = action.payload;
      if (infos && members) {
        state.infos[groupPk] = infos;
        state.members[groupPk] = members;

        // window.log.debug(`groupInfo after merge: ${stringify(infos)}`);
        // window.log.debug(`groupMembers after merge: ${stringify(members)}`);
      } else {
        window.log.debug(
          `refreshGroupDetailsFromWrapper no details found, removing from slice: ${groupPk}}`
        );

        deleteGroupPkEntriesFromState(state, groupPk);
      }
      return state;
    });
    builder.addCase(refreshGroupDetailsFromWrapper.rejected, (_state, action) => {
      window.log.error('a refreshGroupDetailsFromWrapper was rejected', action.error);
    });
    builder.addCase(destroyGroupDetails.fulfilled, (state, action) => {
      const { groupPk } = action.payload;
      // FIXME destroyGroupDetails marks the info as destroyed, but does not really remove the wrapper currently
      deleteGroupPkEntriesFromState(state, groupPk);
    });
    builder.addCase(destroyGroupDetails.rejected, (_state, action) => {
      window.log.error('a destroyGroupDetails was rejected', action.error);
    });
    builder.addCase(handleUserGroupUpdate.fulfilled, (state, action) => {
      const { infos, members, groupPk } = action.payload;
      if (infos && members) {
        state.infos[groupPk] = infos;
        state.members[groupPk] = members;

        window.log.debug(`groupInfo after handleUserGroupUpdate: ${stringify(infos)}`);
        window.log.debug(`groupMembers after handleUserGroupUpdate: ${stringify(members)}`);
      } else {
        window.log.debug(
          `handleUserGroupUpdate no details found, removing from slice: ${groupPk}}`
        );

        deleteGroupPkEntriesFromState(state, groupPk);
      }
    });
    builder.addCase(handleUserGroupUpdate.rejected, (_state, action) => {
      window.log.error('a handleUserGroupUpdate was rejected', action.error);
    });
    builder.addCase(currentDeviceGroupMembersChange.fulfilled, (state, action) => {
      state.memberChangesFromUIPending = false;

      const { infos, members, groupPk } = action.payload;
      state.infos[groupPk] = infos;
      state.members[groupPk] = members;

      window.log.debug(`groupInfo after currentDeviceGroupMembersChange: ${stringify(infos)}`);
      window.log.debug(`groupMembers after currentDeviceGroupMembersChange: ${stringify(members)}`);
    });
    builder.addCase(currentDeviceGroupMembersChange.rejected, (state, action) => {
      window.log.error('a currentDeviceGroupMembersChange was rejected', action.error);
      state.memberChangesFromUIPending = false;
    });
    builder.addCase(currentDeviceGroupMembersChange.pending, state => {
      state.memberChangesFromUIPending = true;
    });

    /** currentDeviceGroupNameChange */
    builder.addCase(currentDeviceGroupNameChange.fulfilled, (state, action) => {
      state.nameChangesFromUIPending = false;

      const { infos, members, groupPk } = action.payload;
      state.infos[groupPk] = infos;
      state.members[groupPk] = members;

      window.log.debug(`groupInfo after currentDeviceGroupNameChange: ${stringify(infos)}`);
      window.log.debug(`groupMembers after currentDeviceGroupNameChange: ${stringify(members)}`);
    });
    builder.addCase(currentDeviceGroupNameChange.rejected, (state, action) => {
      window.log.error('a currentDeviceGroupNameChange was rejected', action.error);
      state.nameChangesFromUIPending = false;
    });
    builder.addCase(currentDeviceGroupNameChange.pending, state => {
      state.nameChangesFromUIPending = true;
    });

    /** handleMemberLeftMessage */
    builder.addCase(handleMemberLeftMessage.fulfilled, (state, action) => {
      const { infos, members, groupPk } = action.payload;
      state.infos[groupPk] = infos;
      state.members[groupPk] = members;

      window.log.debug(`groupInfo after handleMemberLeftMessage: ${stringify(infos)}`);
      window.log.debug(`groupMembers after handleMemberLeftMessage: ${stringify(members)}`);
    });
    builder.addCase(handleMemberLeftMessage.rejected, (_state, action) => {
      window.log.error('a handleMemberLeftMessage was rejected', action.error);
    });

    /** markUsAsAdmin */
    builder.addCase(markUsAsAdmin.fulfilled, (state, action) => {
      const { infos, members, groupPk } = action.payload;
      state.infos[groupPk] = infos;
      state.members[groupPk] = members;

      window.log.debug(`groupInfo after markUsAsAdmin: ${stringify(infos)}`);
      window.log.debug(`groupMembers after markUsAsAdmin: ${stringify(members)}`);
    });
    builder.addCase(markUsAsAdmin.rejected, (_state, action) => {
      window.log.error('a markUsAsAdmin was rejected', action.error);
    });

    builder.addCase(inviteResponseReceived.fulfilled, (state, action) => {
      const { infos, members, groupPk } = action.payload;
      state.infos[groupPk] = infos;
      state.members[groupPk] = members;

      window.log.debug(`groupInfo after inviteResponseReceived: ${stringify(infos)}`);
      window.log.debug(`groupMembers after inviteResponseReceived: ${stringify(members)}`);
    });
    builder.addCase(inviteResponseReceived.rejected, (_state, action) => {
      window.log.error('a inviteResponseReceived was rejected', action.error);
    });
  },
});

export const groupInfoActions = {
  initNewGroupInWrapper,
  loadMetaDumpsFromDB,
  destroyGroupDetails,
  refreshGroupDetailsFromWrapper,
  handleUserGroupUpdate,
  currentDeviceGroupMembersChange,
  markUsAsAdmin,
  inviteResponseReceived,
  handleMemberLeftMessage,
  currentDeviceGroupNameChange,

  ...metaGroupSlice.actions,
};
export const groupReducer = metaGroupSlice.reducer;

async function scheduleGroupInviteJobs(
  groupPk: GroupPubkeyType,
  withHistory: Array<PubkeyType>,
  withoutHistory: Array<PubkeyType>
) {
  for (let index = 0; index < withoutHistory.length; index++) {
    const member = withoutHistory[index];
    await GroupInvite.addJob({ groupPk, member });
  }
  for (let index = 0; index < withHistory.length; index++) {
    const member = withHistory[index];
    await GroupInvite.addJob({ groupPk, member });
  }
}
