/* eslint-disable no-await-in-loop */
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  GroupInfoGet,
  GroupMemberGet,
  GroupPubkeyType,
  PubkeyType,
  UserGroupsGet,
  WithGroupPubkey,
} from 'libsession_util_nodejs';
import { base64_variants, from_base64 } from 'libsodium-wrappers-sumo';
import { intersection, isEmpty, uniq } from 'lodash';
import { ConfigDumpData } from '../../data/configDump/configDump';
import { ConversationTypeEnum } from '../../models/conversationAttributes';
import { HexString } from '../../node/hexStrings';
import { SignalService } from '../../protobuf';
import { getMessageQueue } from '../../session';
import { getSwarmPollingInstance } from '../../session/apis/snode_api';
import { GetNetworkTime } from '../../session/apis/snode_api/getNetworkTime';
import { SnodeNamespaces } from '../../session/apis/snode_api/namespaces';
import { RevokeChanges, SnodeAPIRevoke } from '../../session/apis/snode_api/revokeSubaccount';
import { SnodeGroupSignature } from '../../session/apis/snode_api/signature/groupSignature';
import { ConvoHub } from '../../session/conversations';
import { getSodiumRenderer } from '../../session/crypto';
import { ClosedGroup } from '../../session/group/closed-group';
import { GroupUpdateInfoChangeMessage } from '../../session/messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateInfoChangeMessage';
import { GroupUpdateMemberChangeMessage } from '../../session/messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateMemberChangeMessage';
import { GroupUpdateDeleteMessage } from '../../session/messages/outgoing/controlMessage/group_v2/to_user/GroupUpdateDeleteMessage';
import { PubKey } from '../../session/types';
import { UserUtils } from '../../session/utils';
import { getUserED25519KeyPairBytes } from '../../session/utils/User';
import { PreConditionFailed } from '../../session/utils/errors';
import { RunJobResult } from '../../session/utils/job_runners/PersistedJob';
import { GroupInvite } from '../../session/utils/job_runners/jobs/GroupInviteJob';
import { GroupSync } from '../../session/utils/job_runners/jobs/GroupSyncJob';
import { UserSync } from '../../session/utils/job_runners/jobs/UserSyncJob';
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
import { resetOverlayMode } from './section';

type WithAddWithoutHistoryMembers = { withoutHistory: Array<PubkeyType> };
type WithAddWithHistoryMembers = { withHistory: Array<PubkeyType> };
type WithRemoveMembers = { removed: Array<PubkeyType> };
type WithFromCurrentDevice = { fromCurrentDevice: boolean }; // there are some changes we want to do only when the current user do the change, and not when a network change triggers it.

export type GroupState = {
  infos: Record<GroupPubkeyType, GroupInfoGet>;
  members: Record<GroupPubkeyType, Array<GroupMemberGet>>;
  creationFromUIPending: boolean;
  memberChangesFromUIPending: boolean;
  nameChangesFromUIPending: boolean;
};

export const initialGroupState: GroupState = {
  infos: {},
  members: {},
  creationFromUIPending: false,
  memberChangesFromUIPending: false,
  nameChangesFromUIPending: false,
};

type GroupDetailsUpdate = {
  groupPk: GroupPubkeyType;
  infos: GroupInfoGet;
  members: Array<GroupMemberGet>;
};

async function checkWeAreAdminOrThrow(groupPk: GroupPubkeyType, context: string) {
  const us = UserUtils.getOurPubKeyStrFromCache();
  const inGroup = await MetaGroupWrapperActions.memberGet(groupPk, us);
  const haveAdminkey = await UserGroupsWrapperActions.getGroup(groupPk);
  if (!haveAdminkey || inGroup?.promoted) {
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

      const result = await GroupSync.pushChangesToGroupSwarmIfNeeded(groupPk, []);
      if (result !== RunJobResult.Success) {
        window.log.warn('GroupSync.pushChangesToGroupSwarmIfNeeded during create failed');
        throw new Error('failed to pushChangesToGroupSwarmIfNeeded');
      }
      getSwarmPollingInstance().addGroupId(new PubKey(groupPk));

      await convo.unhideIfNeeded();
      convo.set({ active_at: Date.now() });
      await convo.commit();
      convo.updateLastMessage();
      dispatch(resetOverlayMode());

      // Everything is setup for this group, we now need to send the invites to each members,
      // privately and asynchronously, and gracefully handle errors with toasts.
      // Let's do all of this part of a job to handle app crashes and make sure we
      //  can update the groupwrapper with a failed state if a message fails to be sent.
      for (let index = 0; index < membersFromWrapper.length; index++) {
        const member = membersFromWrapper[index];
        await GroupInvite.addGroupInviteJob({ member: member.pubkeyHex, groupPk });
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

function validateMemberChange({
  groupPk,
  withHistory: addMembersWithHistory,
  withoutHistory: addMembersWithoutHistory,
  removed: removeMembers,
}: WithGroupPubkey & WithAddWithoutHistoryMembers & WithAddWithHistoryMembers & WithRemoveMembers) {
  const us = UserUtils.getOurPubKeyStrFromCache();
  if (
    addMembersWithHistory.includes(us) ||
    addMembersWithoutHistory.includes(us) ||
    removeMembers.includes(us)
  ) {
    throw new PreConditionFailed(
      'currentDeviceGroupMembersChange cannot be used for changes of our own state in the group'
    );
  }

  const withHistory = uniq(addMembersWithHistory);
  const withoutHistory = uniq(addMembersWithoutHistory);
  const removed = uniq(removeMembers);
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    throw new PreConditionFailed('currentDeviceGroupMembersChange convo not present in convohub');
  }
  if (intersection(withHistory, withoutHistory).length) {
    throw new Error(
      'withHistory and withoutHistory can only have values which are not in the other'
    );
  }

  if (
    intersection(withHistory, removed).length ||
    intersection(withHistory, removed).length ||
    intersection(withoutHistory, removed).length
  ) {
    throw new Error(
      'withHistory/without and removed can only have values which are not in the other'
    );
  }
  return { withoutHistory, withHistory, removed, us, convo };
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

async function handleWithoutHistoryMembers({
  groupPk,
  withoutHistory,
}: WithGroupPubkey & WithAddWithoutHistoryMembers) {
  for (let index = 0; index < withoutHistory.length; index++) {
    const member = withoutHistory[index];
    const created = await MetaGroupWrapperActions.memberGetOrConstruct(groupPk, member);
    await MetaGroupWrapperActions.memberSetInvited(groupPk, created.pubkeyHex, false);
  }
}

async function handleRemoveMembers({
  groupPk,
  removed,
  secretKey,
  fromCurrentDevice,
}: WithGroupPubkey & WithRemoveMembers & WithFromCurrentDevice & { secretKey: Uint8Array }) {
  if (!fromCurrentDevice) {
    return;
  }
  await MetaGroupWrapperActions.memberEraseAndRekey(groupPk, removed);

  const timestamp = GetNetworkTime.now();
  await Promise.all(
    removed.map(async m => {
      const adminSignature = await SnodeGroupSignature.signDataWithAdminSecret(
        `DELETE${m}${timestamp}`,
        { secretKey }
      );
      const deleteMessage = new GroupUpdateDeleteMessage({
        groupPk,
        timestamp,
        adminSignature: from_base64(adminSignature.signature, base64_variants.ORIGINAL),
      });
      console.warn(
        'TODO: poll from namespace -11, handle messages and sig for it, batch request handle 401/403, but 200 ok for this -11 namespace'
      );

      const sentStatus = await getMessageQueue().sendToPubKeyNonDurably({
        pubkey: PubKey.cast(m),
        message: deleteMessage,
        namespace: SnodeNamespaces.ClosedGroupRevokedRetrievableMessages,
      });
      if (!sentStatus) {
        window.log.warn('Failed to send a GroupUpdateDeleteMessage to a member removed: ', m);
        throw new Error('Failed to send a GroupUpdateDeleteMessage to a member removed');
      }
    })
  );
}

async function getPendingRevokeChanges({
  withoutHistory,
  withHistory,
  removed,
  groupPk,
}: WithGroupPubkey &
  WithAddWithoutHistoryMembers &
  WithAddWithHistoryMembers &
  WithRemoveMembers): Promise<RevokeChanges> {
  const revokeChanges: RevokeChanges = [];

  for (let index = 0; index < withoutHistory.length; index++) {
    const m = withoutHistory[index];
    const token = await MetaGroupWrapperActions.swarmSubAccountToken(groupPk, m);
    revokeChanges.push({ action: 'unrevoke_subaccount', tokenToRevokeHex: token });
  }
  for (let index = 0; index < withHistory.length; index++) {
    const m = withHistory[index];
    const token = await MetaGroupWrapperActions.swarmSubAccountToken(groupPk, m);
    revokeChanges.push({ action: 'unrevoke_subaccount', tokenToRevokeHex: token });
  }
  for (let index = 0; index < removed.length; index++) {
    const m = removed[index];
    const token = await MetaGroupWrapperActions.swarmSubAccountToken(groupPk, m);
    revokeChanges.push({ action: 'revoke_subaccount', tokenToRevokeHex: token });
  }

  return revokeChanges;
}

async function handleMemberChangeFromUIOrNot({
  addMembersWithHistory,
  addMembersWithoutHistory,
  groupPk,
  removeMembers,
  fromCurrentDevice,
}: WithFromCurrentDevice &
  WithGroupPubkey & {
    addMembersWithHistory: Array<PubkeyType>;
    addMembersWithoutHistory: Array<PubkeyType>;
    removeMembers: Array<PubkeyType>;
  }) {
  const group = await UserGroupsWrapperActions.getGroup(groupPk);
  if (!group || !group.secretKey || isEmpty(group.secretKey)) {
    throw new Error('tried to make change to group but we do not have the admin secret key');
  }

  await checkWeAreAdminOrThrow(groupPk, 'handleMemberChangeFromUIOrNot');

  const { removed, withHistory, withoutHistory, convo, us } = validateMemberChange({
    withHistory: addMembersWithHistory,
    withoutHistory: addMembersWithoutHistory,
    groupPk,
    removed: removeMembers,
  });
  // first, unrevoke people who are added, and sevoke people who are removed
  const revokeChanges = await getPendingRevokeChanges({
    groupPk,
    withHistory,
    withoutHistory,
    removed,
  });

  await SnodeAPIRevoke.revokeSubAccounts(groupPk, revokeChanges, group.secretKey);

  // then, handle the addition with history of messages by generating supplement keys.
  // this adds them to the members wrapper etc
  const supplementKeys = await handleWithHistoryMembers({ groupPk, withHistory });

  // then handle the addition without history of messages (full rotation of keys).
  // this adds them to the members wrapper etc
  await handleWithoutHistoryMembers({ groupPk, withoutHistory });

  // lastly, handle the removal of members.
  // we've already revoked their token above
  // this removes them from the wrapper
  await handleRemoveMembers({ groupPk, removed, secretKey: group.secretKey, fromCurrentDevice });

  // push new members & key supplement in a single batch call
  const batchResult = await GroupSync.pushChangesToGroupSwarmIfNeeded(groupPk, supplementKeys);
  if (batchResult !== RunJobResult.Success) {
    throw new Error(
      'currentDeviceGroupMembersChange: pushChangesToGroupSwarmIfNeeded did not return success'
    );
  }

  // schedule send invite details, auth signature, etc. to the new users
  for (let index = 0; index < withoutHistory.length; index++) {
    const member = withoutHistory[index];
    await GroupInvite.addGroupInviteJob({ groupPk, member });
  }
  for (let index = 0; index < withHistory.length; index++) {
    const member = withHistory[index];
    await GroupInvite.addGroupInviteJob({ groupPk, member });
  }
  const sodium = await getSodiumRenderer();

  const allAdded = [...withHistory, ...withoutHistory]; // those are already enforced to be unique (and without intersection) in `validateMemberChange()`
  const timestamp = Date.now();
  if (fromCurrentDevice && allAdded.length) {
    const msg = await ClosedGroup.addUpdateMessage(
      convo,
      { joiningMembers: allAdded },
      us,
      timestamp
    );
    await getMessageQueue().sendToGroupV2({
      message: new GroupUpdateMemberChangeMessage({
        added: allAdded,
        groupPk,
        typeOfChange: SignalService.GroupUpdateMemberChangeMessage.Type.ADDED,
        identifier: msg.id,
        timestamp,
        secretKey: group.secretKey,
        sodium,
      }),
    });
  }
  if (fromCurrentDevice && removed.length) {
    const msg = await ClosedGroup.addUpdateMessage(
      convo,
      { kickedMembers: removed },
      us,
      timestamp
    );
    await getMessageQueue().sendToGroupV2({
      message: new GroupUpdateMemberChangeMessage({
        removed,
        groupPk,
        typeOfChange: SignalService.GroupUpdateMemberChangeMessage.Type.REMOVED,
        identifier: msg.id,
        timestamp: GetNetworkTime.now(),
        secretKey: group.secretKey,
        sodium,
      }),
    });
  }

  convo.set({
    active_at: timestamp,
  });
  await convo.commit();
}

async function handleNameChangeFromUIOrNot({
  groupPk,
  newName: uncheckedName,
  fromCurrentDevice,
}: WithFromCurrentDevice &
  WithGroupPubkey & {
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

  const batchResult = await GroupSync.pushChangesToGroupSwarmIfNeeded(groupPk, []);
  if (batchResult !== RunJobResult.Success) {
    throw new Error(
      'handleNameChangeFromUIOrNot: pushChangesToGroupSwarmIfNeeded did not return success'
    );
  }

  await UserSync.queueNewJobIfNeeded();

  const timestamp = Date.now();

  if (fromCurrentDevice) {
    const msg = await ClosedGroup.addUpdateMessage(convo, { newName }, us, timestamp);
    await getMessageQueue().sendToGroupV2({
      message: new GroupUpdateInfoChangeMessage({
        groupPk,
        typeOfChange: SignalService.GroupUpdateInfoChangeMessage.Type.NAME,
        updatedName: newName,
        identifier: msg.id,
        timestamp: Date.now(),
        secretKey: group.secretKey,
        sodium: await getSodiumRenderer(),
      }),
    });
  }

  convo.set({
    active_at: timestamp,
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

    await handleMemberChangeFromUIOrNot({ groupPk, ...args, fromCurrentDevice: true });

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
    }: {
      groupPk: GroupPubkeyType;
    },
    payloadCreator
  ): Promise<GroupDetailsUpdate> => {
    const state = payloadCreator.getState() as StateType;
    if (!state.groups.infos[groupPk] || !state.groups.members[groupPk]) {
      throw new PreConditionFailed('markUsAsAdmin group not present in redux slice');
    }
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
    await checkWeAreAdminOrThrow(groupPk, 'inviteResponseReceived');

    await MetaGroupWrapperActions.memberSetAccepted(groupPk, member);
    await GroupSync.queueNewJobIfNeeded(groupPk);

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

    await handleNameChangeFromUIOrNot({ groupPk, ...args, fromCurrentDevice: true });

    return {
      groupPk,
      infos: await MetaGroupWrapperActions.infoGet(groupPk),
      members: await MetaGroupWrapperActions.memberGetAll(groupPk),
    };
  }
);

/**
 * This slice is the one holding the default joinable rooms fetched once in a while from the default opengroup v2 server.
 */
const groupSlice = createSlice({
  name: 'group',
  initialState: initialGroupState,
  reducers: {},
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

        delete state.infos[groupPk];
        delete state.members[groupPk];
      }
      return state;
    });
    builder.addCase(refreshGroupDetailsFromWrapper.rejected, (_state, action) => {
      window.log.error('a refreshGroupDetailsFromWrapper was rejected', action.error);
    });
    builder.addCase(destroyGroupDetails.fulfilled, (state, action) => {
      const { groupPk } = action.payload;
      // FIXME destroyGroupDetails marks the info as destroyed, but does not really remove the wrapper currently
      delete state.infos[groupPk];
      delete state.members[groupPk];
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

        delete state.infos[groupPk];
        delete state.members[groupPk];
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
  currentDeviceGroupNameChange,
  ...groupSlice.actions,
};
export const groupReducer = groupSlice.reducer;
