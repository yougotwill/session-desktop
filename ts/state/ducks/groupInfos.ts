import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { GroupInfoGet, GroupInfoShared, GroupPubkeyType } from 'libsession_util_nodejs';
import { ConversationTypeEnum } from '../../models/conversationAttributes';
import { HexString } from '../../node/hexStrings';
import { ClosedGroup } from '../../session';
import { getConversationController } from '../../session/conversations';
import { UserUtils } from '../../session/utils';
import {
  MetaGroupWrapperActions,
  UserGroupsWrapperActions,
} from '../../webworker/workers/browser/libsession_worker_interface';
import { toFixedUint8ArrayOfLength } from '../../types/sqlSharedTypes';
import { uniq } from 'lodash';

type GroupInfoGetWithId = GroupInfoGet & { id: GroupPubkeyType };

export type GroupInfosState = {
  infos: Record<GroupPubkeyType, GroupInfoGetWithId>;
};

export const initialGroupInfosState: GroupInfosState = {
  infos: {},
};

const updateGroupInfoInWrapper = createAsyncThunk(
  'groupInfos/updateGroupInfoInWrapper',
  async ({
    id,
    data,
  }: {
    id: GroupPubkeyType;
    data: GroupInfoShared;
  }): Promise<GroupInfoGetWithId> => {
    // TODO this will throw if the wrapper is not init yet... how to make sure it does exist?
    const infos = await MetaGroupWrapperActions.infoSet(id, data);
    return { id, ...infos };
  }
);

const initNewGroupInfoInWrapper = createAsyncThunk(
  'groupInfos/initNewGroupInfoInWrapper',
  async (groupDetails: {
    groupName: string;
    members: Array<string>;
  }): Promise<GroupInfoGetWithId> => {
    try {
      const newGroup = await UserGroupsWrapperActions.createGroup();
      const ourEd25519KeypairBytes = await UserUtils.getUserED25519KeyPairBytes();
      if (!ourEd25519KeypairBytes) {
        throw new Error('Current user has no priv ed25519 key?');
      }
      const userEd25519Secretkey = ourEd25519KeypairBytes.privKeyBytes;
      const groupEd2519Pk = HexString.fromHexString(newGroup.pubkeyHex).slice(1); // remove the 03 prefix (single byte once in hex form)

      // dump is always empty when creating a new groupInfo
      await MetaGroupWrapperActions.init(newGroup.pubkeyHex, {
        metaDumped: null,
        userEd25519Secretkey: toFixedUint8ArrayOfLength(userEd25519Secretkey, 64),
        groupEd25519Secretkey: newGroup.secretKey,
        groupEd25519Pubkey: toFixedUint8ArrayOfLength(groupEd2519Pk, 32),
      });

      const infos = await MetaGroupWrapperActions.infoGet(newGroup.pubkeyHex);
      if (!infos) {
        throw new Error(
          `getInfos of ${newGroup.pubkeyHex} returned empty result even if it was just init.`
        );
      }

      const convo = await getConversationController().getOrCreateAndWait(
        newGroup.pubkeyHex,
        ConversationTypeEnum.GROUPV3
      );

      await convo.setIsApproved(true, false);

      console.warn('store the v3 identityPrivatekeypair as part of the wrapper only?');

      const us = UserUtils.getOurPubKeyStrFromCache();
      // Ensure the current user is a member and admin
      const members = uniq([...groupDetails.members, us]);

      const updateGroupDetails: ClosedGroup.GroupInfo = {
        id: newGroup.pubkeyHex,
        name: groupDetails.groupName,
        members,
        admins: [us],
        activeAt: Date.now(),
        expireTimer: 0,
      };

      // be sure to call this before sending the message.
      // the sending pipeline needs to know from GroupUtils when a message is for a medium group
      await ClosedGroup.updateOrCreateClosedGroup(updateGroupDetails);
      await convo.commit();
      convo.updateLastMessage();

      return { id: newGroup.pubkeyHex, ...infos };
    } catch (e) {
      throw e;
    }
  }
);

/**
 * This slice is the one holding the default joinable rooms fetched once in a while from the default opengroup v2 server.
 */
const groupInfosSlice = createSlice({
  name: 'groupInfos',
  initialState: initialGroupInfosState,
  reducers: {
    updateGroupInfosFromMergeResults(state, action: PayloadAction<Array<GroupInfoGetWithId>>) {
      // anything not in the results should not be in the state here
      state.infos = {};
      action.payload.forEach(infos => {
        state.infos[infos.id] = infos;
      });
      return state;
    },
  },
  extraReducers: builder => {
    builder.addCase(updateGroupInfoInWrapper.fulfilled, (state, action) => {
      state.infos[action.payload.id] = action.payload;
    });
    builder.addCase(initNewGroupInfoInWrapper.fulfilled, (state, action) => {
      state.infos[action.payload.id] = action.payload;
    });
    builder.addCase(updateGroupInfoInWrapper.rejected, () => {
      window.log.error('a updateGroupInfoInWrapper was rejected');
    });
    builder.addCase(initNewGroupInfoInWrapper.rejected, () => {
      window.log.error('a initNewGroupInfoInWrapper was rejected');
    });
  },
});

export const groupInfoActions = {
  initNewGroupInfoInWrapper,
  updateGroupInfoInWrapper,
  ...groupInfosSlice.actions,
};
export const groupInfosReducer = groupInfosSlice.reducer;
