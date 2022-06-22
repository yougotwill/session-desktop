import React from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import {
  approveConvoAndSendResponse,
  declineConversationWithConfirm,
} from '../../interactions/conversationInteractions';
import { getConversationController } from '../../session/conversations';
import {
  getSelectedConversation,
  hasSelectedConversationIncomingMessages,
} from '../../state/selectors/conversations';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../basic/SessionButton';

export const ConversationMessageRequestButtons = () => {
  const selectedConversation = useSelector(getSelectedConversation);

  const hasIncomingMessages = useSelector(hasSelectedConversationIncomingMessages);

  if (!selectedConversation || !hasIncomingMessages) {
    return null;
  }

  const convoModel = getConversationController().get(selectedConversation.id);
  const showMsgRequestUI = convoModel && convoModel.isIncomingRequest();

  const handleDeclineConversationRequest = () => {
    declineConversationWithConfirm(selectedConversation.id, true);
  };

  const handleAcceptConversationRequest = async () => {
    const { id } = selectedConversation;
    const convo = getConversationController().get(selectedConversation.id);
    await convo.setDidApproveMe(true);
    await convo.addOutgoingApprovalMessage(Date.now());
    await approveConvoAndSendResponse(id, true);
  };

  if (!showMsgRequestUI) {
    return null;
  }

  return (
    <ConversationRequestBanner>
      <ConversationBannerRow>
        <SessionButton
          buttonColor={SessionButtonColor.Green}
          buttonType={SessionButtonType.BrandOutline}
          onClick={handleAcceptConversationRequest}
          text={window.i18n('accept')}
          dataTestId="accept-message-request"
        />
        <SessionButton
          buttonColor={SessionButtonColor.Danger}
          buttonType={SessionButtonType.BrandOutline}
          text={window.i18n('decline')}
          onClick={handleDeclineConversationRequest}
          dataTestId="decline-message-request"
        />
      </ConversationBannerRow>
    </ConversationRequestBanner>
  );
};

const ConversationBannerRow = styled.div`
  display: flex;
  flex-direction: row;
  gap: var(--margins-lg);
  justify-content: center;
`;

const ConversationRequestBanner = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--margins-lg);
  gap: var(--margins-lg);
`;
