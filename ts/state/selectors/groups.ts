import { GroupMemberGet, GroupPubkeyType, PubkeyType } from 'libsession_util_nodejs';
import { useSelector } from 'react-redux';
import { PubKey } from '../../session/types';
import { GroupState } from '../ducks/metaGroups';
import { StateType } from '../reducer';

const getLibGroupsState = (state: StateType): GroupState => state.groups;

function getMembersOfGroup(state: StateType, convo?: string): Array<GroupMemberGet> {
  if (!convo) {
    return [];
  }
  if (!PubKey.is03Pubkey(convo)) {
    return [];
  }

  const members = getLibGroupsState(state).members[convo];
  return members || [];
}

function findMemberInMembers(members: Array<GroupMemberGet>, memberPk: string) {
  return members.find(m => m.pubkeyHex === memberPk);
}

export function getLibMembersPubkeys(state: StateType, convo?: string): Array<PubkeyType> {
  const members = getMembersOfGroup(state, convo);

  return members.map(m => m.pubkeyHex);
}

function getIsCreatingGroupFromUI(state: StateType): boolean {
  return getLibGroupsState(state).creationFromUIPending;
}

function getIsMemberGroupChangePendingFromUI(state: StateType): boolean {
  return getLibGroupsState(state).memberChangesFromUIPending;
}

export function getLibAdminsPubkeys(state: StateType, convo?: string): Array<string> {
  const members = getMembersOfGroup(state, convo);

  return members.filter(m => m.promoted).map(m => m.pubkeyHex);
}

function getMemberInviteFailed(state: StateType, pubkey: PubkeyType, convo?: GroupPubkeyType) {
  const members = getMembersOfGroup(state, convo);
  return findMemberInMembers(members, pubkey)?.inviteFailed || false;
}

function getMemberInvitePending(state: StateType, pubkey: PubkeyType, convo?: GroupPubkeyType) {
  const members = getMembersOfGroup(state, convo);
  return findMemberInMembers(members, pubkey)?.invitePending || false;
}

function getMemberIsPromoted(state: StateType, pubkey: PubkeyType, convo?: GroupPubkeyType) {
  const members = getMembersOfGroup(state, convo);
  return findMemberInMembers(members, pubkey)?.promoted || false;
}

function getMemberPromotionFailed(state: StateType, pubkey: PubkeyType, convo?: GroupPubkeyType) {
  const members = getMembersOfGroup(state, convo);
  return findMemberInMembers(members, pubkey)?.promotionFailed || false;
}

function getMemberPromotionPending(state: StateType, pubkey: PubkeyType, convo?: GroupPubkeyType) {
  const members = getMembersOfGroup(state, convo);
  return findMemberInMembers(members, pubkey)?.promotionPending || false;
}

export function getLibMembersCount(state: StateType, convo?: GroupPubkeyType): Array<string> {
  return getLibMembersPubkeys(state, convo);
}

function getLibGroupName(state: StateType, convo?: string): string | undefined {
  if (!convo) {
    return undefined;
  }
  if (!PubKey.is03Pubkey(convo)) {
    return undefined;
  }

  const name = getLibGroupsState(state).infos[convo]?.name;
  return name || undefined;
}

export function useLibGroupName(convoId?: string): string | undefined {
  return useSelector((state: StateType) => getLibGroupName(state, convoId));
}

export function useLibGroupMembers(convoId?: string): Array<PubkeyType> {
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

export function getMemberInvitePendingOutsideRedux(
  member: PubkeyType,
  convoId: GroupPubkeyType
): boolean {
  const state = window.inboxStore?.getState();
  return state ? getMemberInvitePending(state, member, convoId) : false;
}

export function useIsCreatingGroupFromUIPending() {
  return useSelector(getIsCreatingGroupFromUI);
}

export function useMemberInviteFailed(member: PubkeyType, groupPk: GroupPubkeyType) {
  return useSelector((state: StateType) => getMemberInviteFailed(state, member, groupPk));
}

export function useMemberInvitePending(member: PubkeyType, groupPk: GroupPubkeyType) {
  return useSelector((state: StateType) => getMemberInvitePending(state, member, groupPk));
}
export function useMemberIsPromoted(member: PubkeyType, groupPk: GroupPubkeyType) {
  return useSelector((state: StateType) => getMemberIsPromoted(state, member, groupPk));
}

export function useMemberPromotionFailed(member: PubkeyType, groupPk: GroupPubkeyType) {
  return useSelector((state: StateType) => getMemberPromotionFailed(state, member, groupPk));
}

export function useMemberPromotionPending(member: PubkeyType, groupPk: GroupPubkeyType) {
  return useSelector((state: StateType) => getMemberPromotionPending(state, member, groupPk));
}

export function useMemberGroupChangePending() {
  return useSelector(getIsMemberGroupChangePendingFromUI);
}
