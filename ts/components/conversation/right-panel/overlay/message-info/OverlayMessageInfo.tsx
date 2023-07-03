import React from 'react';

import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import {
  deleteMessagesById,
  deleteMessagesByIdForEveryone,
} from '../../../../../interactions/conversations/unsendingInteractions';
import { closeMessageDetailsView, closeRightPanel } from '../../../../../state/ducks/conversations';
import { resetRightOverlayMode, setRightOverlayMode } from '../../../../../state/ducks/section';
import { getMessageDetailsViewProps } from '../../../../../state/selectors/conversations';
import { Flex } from '../../../../basic/Flex';
import { Header, HeaderTitle, StyledScrollContainer } from '../components';
// tslint:disable-next-line: no-submodule-imports
import useKey from 'react-use/lib/useKey';
import { Message } from '../../../message/message-item/Message';
import { AttachmentInfo, MessageInfo } from './components';
import { PanelButtonGroup, PanelIconButton } from '../../../../buttons';
import { saveAttachmentToDisk } from '../../../../../util/attachmentsUtil';
import {
  replyToMessage,
  resendMessage,
} from '../../../../../interactions/conversationInteractions';
import { SpacerLG, SpacerMD, SpacerXL } from '../../../../basic/Text';
import { AttachmentCarousel } from './components/AttachmentCarousel';
import { getRightOverlayMode } from '../../../../../state/selectors/section';
import {
  useMessageIsDeletable,
  useMessageIsDeletableForEveryone,
} from '../../../../../state/selectors';

const StyledMessageDetailContainer = styled.div`
  height: calc(100% - 48px);
  width: 100%;
  overflow-y: auto;
  z-index: 2;
`;

const StyledMessageDetail = styled.div`
  max-width: 650px;
  margin-inline-start: auto;
  margin-inline-end: auto;
  padding: var(--margins-sm) var(--margins-lg) var(--margins-lg);
`;

// NOTE we override the default max-widths when in the detail isDetailView
const StyledMessageContainer = styled.div`
  // TODO tweak for when there are no attachments
  padding-bottom: var(--margins-lg);
  .module-message {
    pointer-events: none;

    max-width: 100%;
    @media (min-width: 1200px) {
      max-width: 100%;
    }
  }
`;

export const OverlayMessageInfo = () => {
  const rightOverlayMode = useSelector(getRightOverlayMode);
  const messageDetailProps = useSelector(getMessageDetailsViewProps);
  const isDeletable = useMessageIsDeletable(messageDetailProps?.messageId);
  const isDeletableForEveryone = useMessageIsDeletableForEveryone(messageDetailProps?.messageId);

  const dispatch = useDispatch();

  useKey('Escape', () => {
    dispatch(closeRightPanel());
    dispatch(resetRightOverlayMode());
    dispatch(closeMessageDetailsView());
  });

  if (!rightOverlayMode || !messageDetailProps) {
    return null;
  }

  const { params } = rightOverlayMode;
  const visibleAttachmentIndex = params?.visibleAttachmentIndex || 0;

  const {
    convoId,
    messageId,
    sender,
    attachments,
    timestamp,
    serverTimestamp,
    errors,
    direction,
  } = messageDetailProps;

  const hasAttachments = attachments && attachments.length > 0;
  const hasErrors = errors && errors.length > 0;

  const handleChangeAttachment = (changeDirection: 1 | -1) => {
    if (!hasAttachments) {
      return;
    }

    const newVisibleIndex = visibleAttachmentIndex + changeDirection;
    if (newVisibleIndex > attachments.length - 1) {
      return;
    }

    if (newVisibleIndex < 0) {
      return;
    }

    if (attachments[newVisibleIndex]) {
      dispatch(
        setRightOverlayMode({
          type: 'message_info',
          params: { messageId, visibleAttachmentIndex: newVisibleIndex },
        })
      );
    }
  };

  return (
    <StyledScrollContainer>
      <Flex container={true} flexDirection={'column'} alignItems={'center'}>
        <Header
          hideBackButton={true}
          closeButtonOnClick={() => {
            dispatch(closeRightPanel());
            dispatch(resetRightOverlayMode());
            dispatch(closeMessageDetailsView());
          }}
        >
          <HeaderTitle>{window.i18n('messageInfo')}</HeaderTitle>
        </Header>
        <StyledMessageDetailContainer>
          <StyledMessageDetail>
            <StyledMessageContainer>
              <Message messageId={messageId} isDetailView={true} />
            </StyledMessageContainer>
            {hasAttachments && (
              <>
                <AttachmentCarousel
                  messageId={messageId}
                  attachments={attachments}
                  visibleIndex={visibleAttachmentIndex}
                  nextAction={() => {
                    handleChangeAttachment(1);
                  }}
                  previousAction={() => {
                    handleChangeAttachment(-1);
                  }}
                />
                <SpacerXL />
                <AttachmentInfo attachment={attachments[visibleAttachmentIndex]} />
                <SpacerMD />
              </>
            )}
            <MessageInfo />
            <SpacerLG />
            <PanelButtonGroup>
              <PanelIconButton
                text={window.i18n('replyToMessage')}
                iconType="reply"
                noBackgroundColor={true}
                onClick={async () => {
                  const foundIt = await replyToMessage(messageId);
                  if (foundIt) {
                    dispatch(closeRightPanel());
                    dispatch(resetRightOverlayMode());
                  }
                }}
                dataTestId="reply-to-msg-from-details"
              />
              {hasErrors && direction === 'outgoing' && (
                <PanelIconButton
                  text={window.i18n('resend')}
                  iconType="resend"
                  noBackgroundColor={true}
                  onClick={async () => {
                    await resendMessage(messageId);
                    dispatch(closeRightPanel());
                    dispatch(resetRightOverlayMode());
                  }}
                  dataTestId="resend-msg-from-details"
                />
              )}
              {hasAttachments && (
                <PanelIconButton
                  text={window.i18n('save')}
                  noBackgroundColor={true}
                  iconType="saveToDisk"
                  dataTestId="save-attachment-from-details"
                  onClick={() => {
                    if (hasAttachments) {
                      void saveAttachmentToDisk({
                        conversationId: convoId,
                        messageSender: sender,
                        messageTimestamp: serverTimestamp || timestamp || Date.now(),
                        attachment: attachments[0],
                      });
                    }
                  }}
                />
              )}
              {isDeletable && (
                <PanelIconButton
                  text={window.i18n('deleteJustForMe')}
                  noBackgroundColor={true}
                  iconType="delete"
                  color={'var(--danger-color)'}
                  dataTestId="delete-for-me-from-details"
                  onClick={async () => {
                    await deleteMessagesById([messageId], convoId);
                    dispatch(closeRightPanel());
                    dispatch(resetRightOverlayMode());
                  }}
                />
              )}
              {isDeletableForEveryone && (
                <PanelIconButton
                  text={window.i18n('deleteForEveryone')}
                  iconType="delete"
                  color={'var(--danger-color)'}
                  dataTestId="delete-for-everyone-from-details"
                  noBackgroundColor={true}
                  onClick={async () => {
                    await deleteMessagesByIdForEveryone([messageId], convoId);
                    dispatch(closeRightPanel());
                    dispatch(resetRightOverlayMode());
                  }}
                />
              )}
            </PanelButtonGroup>
            <SpacerXL />
          </StyledMessageDetail>
        </StyledMessageDetailContainer>
      </Flex>
    </StyledScrollContainer>
  );
};
