import React from 'react';

import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import {
  deleteMessagesById,
  deleteMessagesByIdForEveryone,
} from '../../../../../interactions/conversations/unsendingInteractions';
import { closeMessageDetailsView, closeRightPanel } from '../../../../../state/ducks/conversations';
import { resetRightOverlayMode } from '../../../../../state/ducks/section';
import {
  getMessageDetailsViewProps,
  getMessageIsDeletable,
  getMessageIsDeletableForEveryone,
} from '../../../../../state/selectors/conversations';
import { Flex } from '../../../../basic/Flex';
import { Header, HeaderTitle, StyledScrollContainer } from '../components';
// tslint:disable-next-line: no-submodule-imports
import { isEmpty } from 'lodash';
import moment from 'moment';
import useKey from 'react-use/lib/useKey';
import { Message } from '../../../message/message-item/Message';
import { FileInfo, MessageInfoAuthor } from './components';
import { PanelButtonGroup, PanelIconButton } from '../../../../buttons';
import { saveAttachmentToDisk } from '../../../../../util/attachmentsUtil';
import { replyToMessage } from '../../../../../interactions/conversationInteractions';
import { SpacerXL } from '../../../../basic/Text';

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

const StyledMessageContainer = styled.div`
  padding-bottom: var(--margins-lg);
  &:after {
    content: '.';
    visibility: hidden;
    display: block;
    height: 0;
    clear: both;
  }

  .module-message {
    pointer-events: none;
  }
`;

// Message timestamp format: "06:02 PM Tue, 15/11/2022"
const formatTimestamps = 'hh:mm A ddd, D/M/Y';

export const MessageInfoLabel = styled.label`
  font-size: var(--font-size-lg);
  font-weight: bold;
`;

const MessageInfoData = styled.div`
  font-size: var(--font-size-md);
  user-select: text;
`;

const LabelWithInfoContainer = styled.div`
  margin-bottom: var(--margins-md);
`;

type LabelWithInfoProps = { label: string; info: string };

export const LabelWithInfo = (props: LabelWithInfoProps) => {
  return (
    <LabelWithInfoContainer>
      <MessageInfoLabel>{props.label}</MessageInfoLabel>
      <MessageInfoData>{props.info}</MessageInfoData>
    </LabelWithInfoContainer>
  );
};

export const OverlayMessageInfo = () => {
  const messageDetailProps = useSelector(getMessageDetailsViewProps);
  const isDeletable = useSelector(state =>
    getMessageIsDeletable(state as any, messageDetailProps?.messageId || '')
  );
  const isDeletableForEveryone = useSelector(state =>
    getMessageIsDeletableForEveryone(state as any, messageDetailProps?.messageId || '')
  );

  const dispatch = useDispatch();

  useKey('Escape', () => {
    dispatch(closeRightPanel());
    dispatch(resetRightOverlayMode());
    dispatch(closeMessageDetailsView());
  });

  if (!messageDetailProps) {
    return null;
  }

  const {
    errors,
    receivedAt,
    sentAt,
    convoId,
    direction,
    messageId,
    sender,
    attachments,
    timestamp,
    serverTimestamp,
  } = messageDetailProps;

  const sentAtStr = `${moment(sentAt).format(formatTimestamps)}`;
  const receivedAtStr = `${moment(receivedAt).format(formatTimestamps)}`;

  const hasAttachments = attachments && attachments.length > 0 && attachments[0];

  const hasError = !isEmpty(errors);
  const errorString = hasError
    ? errors?.reduce((previous, current) => {
        return `${previous} ${current.name}: "${current.message}";`;
      }, '')
    : null;

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
            {hasAttachments ? (
              <FileInfo attachment={attachments[0]} />
            ) : (
              <>
                <LabelWithInfo label={`${window.i18n('sent')}:`} info={sentAtStr} />
                {direction === 'incoming' ? (
                  <LabelWithInfo label={`${window.i18n('received')}:`} info={receivedAtStr} />
                ) : null}
              </>
            )}
            <MessageInfoAuthor sender={sender} />
            {hasError && (
              <LabelWithInfo label={window.i18n('error')} info={errorString || 'Unknown error'} />
            )}
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
