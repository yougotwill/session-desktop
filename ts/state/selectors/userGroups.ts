import { useSelector } from 'react-redux';
import { PubKey } from '../../session/types';
import { UserGroupState } from '../ducks/userGroups';
import { StateType } from '../reducer';

const getUserGroupState = (state: StateType): UserGroupState => state.userGroups;

const getGroupById = (state: StateType, convoId?: string) => {
  return convoId && PubKey.is03Pubkey(convoId)
    ? getUserGroupState(state).userGroups[convoId]
    : undefined;
};

export function useLibGroupInvitePending(convoId?: string) {
  return useSelector((state: StateType) => getGroupById(state, convoId)?.invitePending);
}

export function useLibGroupInviteGroupName(convoId?: string) {
  return useSelector((state: StateType) => getGroupById(state, convoId)?.name);
}
