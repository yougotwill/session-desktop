import React from 'react';
import classNames from 'classnames';
import moment from 'moment';

import { Message } from './Message';
import { useDispatch, useSelector } from 'react-redux';
import { Avatar, AvatarSize } from '../../../avatar/Avatar';
import { deleteMessagesById } from '../../../../interactions/conversations/unsendingInteractions';
import {
  closeMessageDetailsView,
  closeRightPanel,
  ContactPropsMessageDetail,
} from '../../../../state/ducks/conversations';
import {
  getMessageDetailsViewProps,
  getMessageIsDeletable,
} from '../../../../state/selectors/conversations';
import { ContactName } from '../../ContactName';
// tslint:disable-next-line: no-submodule-imports
import useKey from 'react-use/lib/useKey';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../../../basic/SessionButton';
import { resetRightOverlayMode } from '../../../../state/ducks/section';
import styled from 'styled-components';

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

const StyledContactContainer = styled.div`
  margin-bottom: var(--margins-lg);
`;

const ContactsItem = (props: { contacts: Array<ContactPropsMessageDetail> }) => {
  const { contacts } = props;

  if (!contacts || !contacts.length) {
    return null;
  }

  return (
    <StyledContactContainer>
      {contacts.map(contact => (
        <ContactItem key={contact.pubkey} contact={contact} />
      ))}
    </StyledContactContainer>
  );
};

const StyledContact = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 8px;
`;

const StyledContactText = styled.div`
  margin-inline-start: 10px;
  flex-grow: 1;
  min-width: 0;

  .message-detail__profile-name {
    font-weight: bold;
  }
`;

const StyledContactError = styled.div`
  color: var(--danger-color);
  font-weight: 300;
`;

const ContactItem = (props: { contact: ContactPropsMessageDetail }) => {
  const { contact } = props;
  const errors = contact.errors || [];
  window.log.debug(`WIP: contact status is ${contact.status}`);

  // TODO Contact status' exist but we don't use them in the UI and there is no styling for them so should we remove this component?
  const statusComponent = (
    <div
      className={classNames(
        'module-message-detail__contact__status-icon',
        `module-message-detail__contact__status-icon--${contact.status}`
      )}
    />
  );

  return (
    <StyledContact key={contact.pubkey}>
      <Avatar size={AvatarSize.S} pubkey={contact.pubkey} />
      <StyledContactText>
        <ContactName
          pubkey={contact.pubkey}
          name={contact.name}
          profileName={contact.profileName}
          shouldShowPubkey={true}
          module={'message-detail'}
        />
        {errors.map((error, index) => (
          <StyledContactError key={index}>{error.message}</StyledContactError>
        ))}
      </StyledContactText>
      {statusComponent}
    </StyledContact>
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
  padding: var(--margins-lg);
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

const StyledDetailLabel = styled.td`
  font-weight: bold;
`;

const StyledAuthorContainerRow = styled.tr`
  display: block;
  margin-top: var(--margins-md);
`;

export const MessageDetail = () => {
  const { i18n } = window;

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

  const {
    errors,
    receivedAt,
    sentAt,
    convoId,
    direction,
    messageId,
    contacts,
  } = messageDetailProps;

  return (
    <StyledMessageDetailContainer>
      <StyledMessageDetail>
        <StyledMessageContainer>
          <Message messageId={messageId} isDetailView={true} />
        </StyledMessageContainer>
        <table>
          <tbody>
            {(errors || []).map((error, index) => (
              <tr key={index}>
                <StyledDetailLabel>{i18n('error')}</StyledDetailLabel>
                <td>
                  {' '}
                  <span className="error-message text-selectable">{error.message}</span>{' '}
                </td>
              </tr>
            ))}
            <tr>
              <StyledDetailLabel>{i18n('sent')}:</StyledDetailLabel>
            </tr>
            <tr>
              <td>
                {moment(sentAt).format('LLLL')} <span>({sentAt})</span>
              </td>
            </tr>
            {direction === 'incoming' ? (
              <>
                <tr>
                  <StyledDetailLabel>{i18n('received')}:</StyledDetailLabel>
                </tr>
                <tr>
                  <td>
                    {moment(receivedAt).format('LLLL')} <span>({receivedAt})</span>
                  </td>
                </tr>
              </>
            ) : null}
            <StyledAuthorContainerRow>
              <StyledDetailLabel>
                {direction === 'incoming' ? i18n('from') : i18n('to')}
              </StyledDetailLabel>
            </StyledAuthorContainerRow>
          </tbody>
        </table>
        <ContactsItem contacts={contacts} />
        <DeleteButtonItem convoId={convoId} messageId={messageId} isDeletable={isDeletable} />
      </StyledMessageDetail>
    </StyledMessageDetailContainer>
  );
};
