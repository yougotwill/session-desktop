import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { getMessageById } from '../../../../data/data';
import { readableList } from '../../../../util/readableList';

export type TipPosition = 'center' | 'left' | 'right';

export const StyledPopupContainer = styled.div<{ tooltipPosition: TipPosition }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 216px;
  height: 72px;
  z-index: 5;

  background-color: var(--color-received-message-background);
  color: var(--color-pill-divider-text);
  box-shadow: 0px 0px 13px rgba(0, 0, 0, 0.51);
  font-size: 12px;
  font-weight: 600;
  overflow-wrap: break-word;
  padding: 16px;
  border-radius: 12px;
  cursor: pointer;

  &:after {
    content: '';
    position: absolute;
    top: calc(100% - 19px);
    left: ${props => {
      switch (props.tooltipPosition) {
        case 'left':
          return '24px';
        case 'right':
          return 'calc(100% - 48px)';
        case 'center':
        default:
          return 'calc(100% - 100px)';
      }
    }};
    width: 22px;
    height: 22px;
    background-color: var(--color-received-message-background);
    transform: rotate(45deg);
    border-radius: 3px;
    transform: scaleY(1.4) rotate(45deg);
    clip-path: polygon(100% 100%, 7.2px 100%, 100% 7.2px);
  }
`;

const StyledEmoji = styled.span`
  font-size: 36px;
  margin-left: 8px;
`;

interface Props {
  messageId: string;
  emoji: string;
  senders: Array<string>;
  tooltipPosition?: TipPosition;
  onClick: (...args: any[]) => void;
}

export const MessageReactionPopup = (props: Props): ReactElement => {
  const { messageId, emoji, senders, tooltipPosition = 'center', onClick } = props;

  const [contacts, setContacts] = useState('');

  const generateContacts = useCallback(async () => {
    let contacts = null;
    const message = await getMessageById(messageId);
    if (message) {
      contacts = senders.map(sender => {
        const contact = message.findAndFormatContact(sender);
        if (contact.isMe) {
          // remove pubkey
          return contact.title ? contact.title.slice(0, -14) : contact.profileName ?? sender;
        }
        return contact.profileName ?? sender;
      });
    }
    return contacts;
  }, [messageId]);

  const renderContacts = (_contacts: string) => {
    if (!_contacts) {
      return <></>;
    }

    if (_contacts.indexOf('&') !== -1 && _contacts.indexOf('other') !== -1) {
      const [names, others] = _contacts.split('&');
      return (
        <span>
          {names} & <span style={{ color: 'var(--color-accent' }}>{others}</span> reacted with
        </span>
      );
    }

    return <span>{_contacts} reacted with</span>;
  }

  useEffect(() => {
    let isCancelled = false;
    generateContacts()
      .then(async result => {
        if (isCancelled) {
          return;
        }
        if (result && result.length > 0) {
          setContacts(readableList(result));
        }
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }
      });
  }, [generateContacts]);

  return (
    <StyledPopupContainer
      tooltipPosition={tooltipPosition}
      onClick={() => {
        onClick();
      }}
    >
      {renderContacts(contacts)}
      <StyledEmoji>{emoji}</StyledEmoji>
    </StyledPopupContainer>
  );
};
