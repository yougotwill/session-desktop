/* eslint-disable no-await-in-loop */
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  GroupInfoGet,
  GroupMemberGet,
  GroupPubkeyType,
  PubkeyType,
  UserGroupsGet,
} from 'libsession_util_nodejs';
import { isEmpty, uniq } from 'lodash';
import { ConfigDumpData } from '../../data/configDump/configDump';
import { ConversationTypeEnum } from '../../models/conversationAttributes';
import { HexString } from '../../node/hexStrings';
import { getSwarmPollingInstance } from '../../session/apis/snode_api';
import { SnodeNamespaces } from '../../session/apis/snode_api/namespaces';
import { SnodeGroupSignature } from '../../session/apis/snode_api/signature/groupSignature';
import { ConvoHub } from '../../session/conversations';
import { getMessageQueue } from '../../session/sending';
import { PubKey } from '../../session/types';
import { UserUtils } from '../../session/utils';
import { getUserED25519KeyPairBytes } from '../../session/utils/User';
import { PreConditionFailed } from '../../session/utils/errors';
import { RunJobResult } from '../../session/utils/job_runners/PersistedJob';
import { GroupSync } from '../../session/utils/job_runners/jobs/GroupSyncJob';
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

export type GroupState = {
  infos: Record<GroupPubkeyType, GroupInfoGet>;
  members: Record<GroupPubkeyType, Array<GroupMemberGet>>;
  creationFromUIPending: boolean;
};

export const initialGroupState: GroupState = {
  infos: {},
  members: {},
  creationFromUIPending: false,
};

type GroupDetailsUpdate = {
  groupPk: GroupPubkeyType;
  infos: GroupInfoGet;
  members: Array<GroupMemberGet>;
};

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
          await MetaGroupWrapperActions.memberSetPromoted(groupPk, created.pubkeyHex, false);
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

      const result = await GroupSync.pushChangesToGroupSwarmIfNeeded(groupPk);
      if (result !== RunJobResult.Success) {
        window.log.warn('GroupSync.pushChangesToGroupSwarmIfNeeded during create failed');
        throw new Error('failed to pushChangesToGroupSwarmIfNeeded');
      }

      await convo.unhideIfNeeded();
      convo.set({ active_at: Date.now() });
      await convo.commit();
      convo.updateLastMessage();
      dispatch(resetOverlayMode());
      await openConversationWithMessages({ conversationKey: groupPk, messageId: null });
      // everything is setup for this group, we now need to send the invites to every members, privately and asynchronously, and gracefully handle errors with toasts.

      const inviteDetails = await SnodeGroupSignature.getGroupInvitesMessages({
        groupName,
        membersFromWrapper,
        secretKey: groupSecretKey,
        groupPk,
      });

      void inviteDetails.map(async detail => {
        await getMessageQueue().sendToPubKeyNonDurably({
          message: detail.invite,
          namespace: SnodeNamespaces.Default,
          pubkey: PubKey.cast(detail.member),
        });
      });

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
      throw new Error('handleUserGroupUpdate group already present in redux slice');
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
    builder.addCase(initNewGroupInWrapper.rejected, state => {
      window.log.error('a initNewGroupInWrapper was rejected');
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
    builder.addCase(loadMetaDumpsFromDB.rejected, state => {
      window.log.error('a loadMetaDumpsFromDB was rejected');
      return state;
    });
    builder.addCase(refreshGroupDetailsFromWrapper.fulfilled, (state, action) => {
      const { infos, members, groupPk } = action.payload;
      if (infos && members) {
        state.infos[groupPk] = infos;
        state.members[groupPk] = members;

        window.log.debug(`groupInfo after merge: ${stringify(infos)}`);
        window.log.debug(`groupMembers after merge: ${stringify(members)}`);
      } else {
        window.log.debug(
          `refreshGroupDetailsFromWrapper no details found, removing from slice: ${groupPk}}`
        );

        delete state.infos[groupPk];
        delete state.members[groupPk];
      }
      return state;
    });
    builder.addCase(refreshGroupDetailsFromWrapper.rejected, () => {
      window.log.error('a refreshGroupDetailsFromWrapper was rejected');
    });
    builder.addCase(destroyGroupDetails.fulfilled, (state, action) => {
      const { groupPk } = action.payload;
      // FIXME destroyGroupDetails marks the info as destroyed, but does not really remove the wrapper currently
      delete state.infos[groupPk];
      delete state.members[groupPk];
    });
    builder.addCase(destroyGroupDetails.rejected, () => {
      window.log.error('a destroyGroupDetails was rejected');
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
    builder.addCase(handleUserGroupUpdate.rejected, () => {
      window.log.error('a handleUserGroupUpdate was rejected');
    });
  },
});

export const groupInfoActions = {
  initNewGroupInWrapper,
  loadMetaDumpsFromDB,
  destroyGroupDetails,
  refreshGroupDetailsFromWrapper,
  handleUserGroupUpdate,
  ...groupSlice.actions,
};
export const groupReducer = groupSlice.reducer;
