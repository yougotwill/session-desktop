import React from 'react';
import moment from 'moment';

import { Message } from './Message';
import { useDispatch, useSelector } from 'react-redux';
import { deleteMessagesById } from '../../../../interactions/conversations/unsendingInteractions';
import { closeMessageDetailsView, closeRightPanel } from '../../../../state/ducks/conversations';
import {
  getMessageDetailsViewProps,
  getMessageIsDeletable,
} from '../../../../state/selectors/conversations';
// tslint:disable-next-line: no-submodule-imports
import useKey from 'react-use/lib/useKey';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../../../basic/SessionButton';
import { resetRightOverlayMode } from '../../../../state/ducks/section';
import styled from 'styled-components';
import { MessageInfoAuthor } from '../../right-panel/overlay/message-info/components/MessageInfoAuthor';
import { isEmpty } from 'lodash';

const StyledDeleteButtonContainer = styled.div`
  text-align: center;
  margin-top: 10px;

  .session-button {
    width: 160px;
    margin: 1rem auto;
  }
`;

const DeleteButtonItem = (props: { messageId: string; convoId: string; isDeletable: boolean }) => {
  const { i18n } = window;

  if (!props.isDeletable) {
    return null;
  }

  return (
    <StyledDeleteButtonContainer>
      <SessionButton
        text={i18n('delete')}
        buttonColor={SessionButtonColor.Danger}
        buttonType={SessionButtonType.Solid}
        onClick={async () => {
          await deleteMessagesById([props.messageId], props.convoId);
        }}
      />
    </StyledDeleteButtonContainer>
  );
};

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

const LabelWithInfo = (props: { label: string; info: string }) => {
  return (
    <LabelWithInfoContainer>
      <MessageInfoLabel>{props.label}</MessageInfoLabel>
      <MessageInfoData>{props.info}</MessageInfoData>
    </LabelWithInfoContainer>
  );
};

export const MessageDetail = () => {
  const messageDetailProps = useSelector(getMessageDetailsViewProps);
  const isDeletable = useSelector(state =>
    getMessageIsDeletable(state as any, messageDetailProps?.messageId || '')
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

  const { errors, receivedAt, sentAt, convoId, direction, messageId, sender } = messageDetailProps;

  const sentAtStr = `${moment(sentAt).format(formatTimestamps)}`;
  const receivedAtStr = `${moment(receivedAt).format(formatTimestamps)}`;

  const hasError = !isEmpty(errors);

  const errorString = hasError
    ? errors?.reduce((previous, current) => {
        return `${previous} ${current.name}: "${current.message}";`;
      }, '')
    : null;

  return (
    <StyledMessageDetailContainer>
      <StyledMessageDetail>
        <StyledMessageContainer>
          <Message messageId={messageId} isDetailView={true} />
        </StyledMessageContainer>
        <LabelWithInfo label={`${window.i18n('sent')}:`} info={sentAtStr} />
        {direction === 'incoming' ? (
          <LabelWithInfo label={`${window.i18n('received')}:`} info={receivedAtStr} />
        ) : null}
        <MessageInfoAuthor sender={sender} />
        {hasError && (
          <LabelWithInfo label={window.i18n('error')} info={errorString || 'Unknown error'} />
        )}
        <DeleteButtonItem convoId={convoId} messageId={messageId} isDeletable={isDeletable} />
      </StyledMessageDetail>
    </StyledMessageDetailContainer>
  );
};
