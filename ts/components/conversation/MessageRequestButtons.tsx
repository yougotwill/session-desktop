import React from 'react';
import styled from 'styled-components';
import { useIsIncomingRequest } from '../../hooks/useParamSelector';
import {
  approveConvoAndSendResponse,
  declineConversationWithConfirm,
} from '../../interactions/conversationInteractions';
import { getSwarmPollingInstance } from '../../session/apis/snode_api/swarmPolling';
import { ConvoHub } from '../../session/conversations';
import { PubKey } from '../../session/types';
import {
  useSelectedConversationIdOrigin,
  useSelectedConversationKey,
  useSelectedIsGroupV2,
  useSelectedIsPrivateFriend,
} from '../../state/selectors/selectedConversation';
import { useLibGroupInvitePending } from '../../state/selectors/userGroups';
import { UserGroupsWrapperActions } from '../../webworker/workers/browser/libsession_worker_interface';
import { SessionButton, SessionButtonColor } from '../basic/SessionButton';
import { InvitedToGroupControlMessage, MessageRequestExplanation } from './SubtleNotification';

const MessageRequestContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--margins-lg);
  gap: var(--margins-lg);
  background-color: var(--background-secondary-color);
`;

const ConversationBannerRow = styled.div`
  display: flex;
  flex-direction: row;
  gap: var(--margins-lg);
  justify-content: center;

  .session-button {
    padding: 0 36px;
  }
`;

const StyledBlockUserText = styled.span`
  color: var(--danger-color);
  cursor: pointer;
  font-size: var(--font-size-md);
  align-self: center;
  font-weight: 700;
`;

const handleDeclineConversationRequest = (
  convoId: string,
  currentSelected: string | undefined,
  conversationIdOrigin: string | null
) => {
  declineConversationWithConfirm({
    conversationId: convoId,
    syncToDevices: true,
    alsoBlock: false,
    currentlySelectedConvo: currentSelected,
    conversationIdOrigin,
  });
};

const handleDeclineAndBlockConversationRequest = (
  convoId: string,
  currentSelected: string | undefined,
  conversationIdOrigin: string | null
) => {
  declineConversationWithConfirm({
    conversationId: convoId,
    syncToDevices: true,
    alsoBlock: true,
    currentlySelectedConvo: currentSelected,
    conversationIdOrigin,
  });
};

const handleAcceptConversationRequest = async (convoId: string) => {
  const convo = ConvoHub.use().get(convoId);
  if (!convo) {
    return;
  }
  await convo.setDidApproveMe(true, false);
  await convo.setIsApproved(true, false);
  await convo.commit();
  if (convo.isPrivate()) {
    await convo.addOutgoingApprovalMessage(Date.now());
    await approveConvoAndSendResponse(convoId);
  } else if (PubKey.is03Pubkey(convoId)) {
    const found = await UserGroupsWrapperActions.getGroup(convoId);
    if (!found) {
      window.log.warn('cannot approve a non existing group in usergroup');
      return;
    }
    // this updates the wrapper and refresh the redux slice
    await UserGroupsWrapperActions.setGroup({ ...found, invitePending: false });
    getSwarmPollingInstance().addGroupId(convoId);
  }
};

export const ConversationMessageRequestButtons = () => {
  const selectedConvoId = useSelectedConversationKey();
  const isIncomingRequest = useIsIncomingRequest(selectedConvoId);
  const isGroupV2 = useSelectedIsGroupV2();
  const isPrivateAndFriend = useSelectedIsPrivateFriend();
  const isGroupPendingInvite = useLibGroupInvitePending(selectedConvoId);
  const convoOrigin = useSelectedConversationIdOrigin() ?? null;

  if (
    !selectedConvoId ||
    isPrivateAndFriend || // if we are already friends, there is no need for the msg request buttons
    (isGroupV2 && !isGroupPendingInvite)
  ) {
    return null;
  }

  if (!isIncomingRequest) {
    return null;
  }

  return (
    <MessageRequestContainer>
      <InvitedToGroupControlMessage />
      <ConversationBannerRow>
        <SessionButton
          onClick={async () => {
            await handleAcceptConversationRequest(selectedConvoId);
          }}
          text={window.i18n('accept')}
          dataTestId="accept-message-request"
        />
        <SessionButton
          buttonColor={SessionButtonColor.Danger}
          text={window.i18n('delete')}
          onClick={() => {
            handleDeclineConversationRequest(selectedConvoId, selectedConvoId, convoOrigin);
          }}
          dataTestId="decline-message-request"
        />
      </ConversationBannerRow>
      <MessageRequestExplanation />

      {(isGroupV2 && !!convoOrigin) || !isGroupV2 ? (
        <StyledBlockUserText
          onClick={() => {
            handleDeclineAndBlockConversationRequest(selectedConvoId, selectedConvoId, convoOrigin);
          }}
          data-testid="decline-and-block-message-request"
        >
          {window.i18n('block')}
        </StyledBlockUserText>
      ) : null}
    </MessageRequestContainer>
  );
};
