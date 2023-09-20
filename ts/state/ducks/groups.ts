/* eslint-disable no-await-in-loop */
import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { GroupInfoGet, GroupMemberGet, GroupPubkeyType } from 'libsession_util_nodejs';
import { isEmpty, uniq } from 'lodash';
import { ConfigDumpData } from '../../data/configDump/configDump';
import { ConversationTypeEnum } from '../../models/conversationAttributes';
import { HexString } from '../../node/hexStrings';
import { getConversationController } from '../../session/conversations';
import { UserUtils } from '../../session/utils';
import { GroupSync } from '../../session/utils/job_runners/jobs/GroupConfigJob';
import { toFixedUint8ArrayOfLength } from '../../types/sqlSharedTypes';
import {
  getGroupPubkeyFromWrapperType,
  isMetaWrapperType,
} from '../../webworker/workers/browser/libsession_worker_functions';
import {
  MetaGroupWrapperActions,
  UserGroupsWrapperActions,
} from '../../webworker/workers/browser/libsession_worker_interface';
import { PreConditionFailed } from '../../session/utils/errors';

export type GroupState = {
  infos: Record<GroupPubkeyType, GroupInfoGet>;
  members: Record<GroupPubkeyType, Array<GroupMemberGet>>;
};

export const initialGroupState: GroupState = {
  infos: {},
  members: {},
};

type GroupDetailsUpdate = {
  groupPk: GroupPubkeyType;
  infos: GroupInfoGet;
  members: Array<GroupMemberGet>;
};

const initNewGroupInWrapper = createAsyncThunk(
  'group/initNewGroupInWrapper',
  async ({
    groupName,
    members,
    us,
  }: {
    groupName: string;
    members: Array<string>;
    us: string;
  }): Promise<GroupDetailsUpdate> => {
    if (!members.includes(us)) {
      throw new PreConditionFailed('initNewGroupInWrapper needs us to be a member');
    }
    const uniqMembers = uniq(members);
    const newGroup = await UserGroupsWrapperActions.createGroup();
    const groupPk = newGroup.pubkeyHex;
    newGroup.name = groupName; // this will be used by the linked devices until they fetch the info from the groups swarm

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
      userEd25519Secretkey: toFixedUint8ArrayOfLength(userEd25519Secretkey, 64),
      groupEd25519Secretkey: newGroup.secretKey,
      groupEd25519Pubkey: toFixedUint8ArrayOfLength(groupEd2519Pk, 32),
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
      throw new Error(`memberGetAll of ${groupPk} returned empty result even if it was just init.`);
    }

    const convo = await getConversationController().getOrCreateAndWait(
      groupPk,
      ConversationTypeEnum.GROUPV3
    );

    await convo.setIsApproved(true, false);

    // console.warn('store the v3 identityPrivatekeypair as part of the wrapper only?');
    // // the sync below will need the secretKey of the group to be saved in the wrapper. So save it!
    await UserGroupsWrapperActions.setGroup(newGroup);

    await GroupSync.queueNewJobIfNeeded(groupPk);

    // const updateGroupDetails: ClosedGroup.GroupInfo = {
    //   id: newGroup.pubkeyHex,
    //   name: groupDetails.groupName,
    //   members,
    //   admins: [us],
    //   activeAt: Date.now(),
    //   expireTimer: 0,
    // };

    // // be sure to call this before sending the message.
    // // the sending pipeline needs to know from GroupUtils when a message is for a medium group
    // await ClosedGroup.updateOrCreateClosedGroup(updateGroupDetails);
    await convo.unhideIfNeeded();
    convo.set({ active_at: Date.now() });
    await convo.commit();
    convo.updateLastMessage();

    return { groupPk: newGroup.pubkeyHex, infos, members: membersFromWrapper };
  }
);

const loadDumpsFromDB = createAsyncThunk(
  'group/loadDumpsFromDB',
  async (): Promise<Array<GroupDetailsUpdate>> => {
    const variantsWithoutData = await ConfigDumpData.getAllDumpsWithoutData();
    const allUserGroups = await UserGroupsWrapperActions.getAllGroups();
    const toReturn: Array<GroupDetailsUpdate> = [];
    for (let index = 0; index < variantsWithoutData.length; index++) {
      const { variant } = variantsWithoutData[index];
      if (!isMetaWrapperType(variant)) {
        continue;
      }
      const groupPk = getGroupPubkeyFromWrapperType(variant);
      const foundInUserWrapper = allUserGroups.find(m => m.pubkeyHex === groupPk);
      if (!foundInUserWrapper) {
        continue;
      }

      try {
        window.log.debug(
          'loadDumpsFromDB loading from metagroup variant: ',
          variant,
          foundInUserWrapper.pubkeyHex
        );

        const infos = await MetaGroupWrapperActions.infoGet(groupPk);
        const members = await MetaGroupWrapperActions.memberGetAll(groupPk);

        toReturn.push({ groupPk, infos, members });

        // Annoyingly, the redux store is not initialized when this current funciton is called,
        // so we need to init the group wrappers here, but load them in their redux slice later
      } catch (e) {
        // TODO should not throw in this case? we should probably just try to load what we manage to load
        window.log.warn(
          `initGroup of Group wrapper of variant ${variant} failed with ${e.message} `
        );
        // throw new Error(`initializeLibSessionUtilWrappers failed with ${e.message}`);
      }
    }

    return toReturn;
  }
);

/**
 * This slice is the one holding the default joinable rooms fetched once in a while from the default opengroup v2 server.
 */
const groupSlice = createSlice({
  name: 'group',
  initialState: initialGroupState,
  reducers: {
    updateGroupDetailsAfterMerge(state, action: PayloadAction<GroupDetailsUpdate>) {
      const { groupPk, infos, members } = action.payload;
      state.infos[groupPk] = infos;
      state.members[groupPk] = members;
    },
  },
  extraReducers: builder => {
    builder.addCase(initNewGroupInWrapper.fulfilled, (state, action) => {
      const { groupPk, infos, members } = action.payload;
      state.infos[groupPk] = infos;
      state.members[groupPk] = members;
    });
    builder.addCase(initNewGroupInWrapper.rejected, () => {
      window.log.error('a initNewGroupInWrapper was rejected');
      // FIXME delete the wrapper completely & correspondign dumps, and usergroups entry?
    });
    builder.addCase(loadDumpsFromDB.fulfilled, (state, action) => {
      const loaded = action.payload;
      loaded.forEach(element => {
        state.infos[element.groupPk] = element.infos;
        state.members[element.groupPk] = element.members;
      });
    });
    builder.addCase(loadDumpsFromDB.rejected, () => {
      window.log.error('a loadDumpsFromDB was rejected');
    });
  },
});

export const groupInfoActions = {
  initNewGroupInWrapper,
  loadDumpsFromDB,
  ...groupSlice.actions,
};
export const groupReducer = groupSlice.reducer;
