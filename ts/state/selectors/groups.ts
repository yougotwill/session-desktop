import { GroupPubkeyType } from 'libsession_util_nodejs';
import { isEmpty } from 'lodash';
import { useSelector } from 'react-redux';
import { PubKey } from '../../session/types';
import { GroupState } from '../ducks/groups';
import { StateType } from '../reducer';

const getLibGroupsState = (state: StateType): GroupState => state.groups;

export function getLibMembersPubkeys(state: StateType, convo?: string): Array<string> {
  if (!convo) {
    return [];
  }
  if (!PubKey.isClosedGroupV2(convo)) {
    return [];
  }

  const members = getLibGroupsState(state).members[convo];
  if (isEmpty(members)) {
    return [];
  }

  return members.map(m => m.pubkeyHex);
}

function getIsCreatingGroupFromUI(state: StateType): boolean {
  return getLibGroupsState(state).creationFromUIPending;
}

export function getLibAdminsPubkeys(state: StateType, convo?: string): Array<string> {
  if (!convo) {
    return [];
  }
  if (!PubKey.isClosedGroupV2(convo)) {
    return [];
  }

  const members = getLibGroupsState(state).members[convo];
  if (isEmpty(members)) {
    return [];
  }

  return members.filter(m => m.promoted).map(m => m.pubkeyHex);
}

export function getLibMembersCount(state: StateType, convo?: GroupPubkeyType): Array<string> {
  return getLibMembersPubkeys(state, convo);
}

function getLibGroupName(state: StateType, convo?: string): string | undefined {
  if (!convo) {
    return undefined;
  }
  if (!PubKey.isClosedGroupV2(convo)) {
    return undefined;
  }

  const name = getLibGroupsState(state).infos[convo]?.name;
  return name || undefined;
}

export function useLibGroupName(convoId?: string): string | undefined {
  return useSelector((state: StateType) => getLibGroupName(state, convoId));
}

export function useLibGroupMembers(convoId?: string): Array<string> {
  return useSelector((state: StateType) => getLibMembersPubkeys(state, convoId));
}

export function useLibGroupAdmins(convoId?: string): Array<string> {
  return useSelector((state: StateType) => getLibAdminsPubkeys(state, convoId));
}

export function getLibGroupNameOutsideRedux(convoId: string): string | undefined {
  const state = window.inboxStore?.getState();
  return state ? getLibGroupName(state, convoId) : undefined;
}

export function getLibGroupMembersOutsideRedux(convoId: string): Array<string> {
  const state = window.inboxStore?.getState();
  return state ? getLibMembersPubkeys(state, convoId) : [];
}

export function getLibGroupAdminsOutsideRedux(convoId: string): Array<string> {
  const state = window.inboxStore?.getState();
  return state ? getLibAdminsPubkeys(state, convoId) : [];
}

export function useIsCreatingGroupFromUIPending() {
  return useSelector(getIsCreatingGroupFromUI);
}
