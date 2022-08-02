import React, { ReactElement, useEffect, useState } from 'react';
import styled from 'styled-components';
import { Data } from '../../../../data/data';
import { PubKey } from '../../../../session/types/PubKey';
import { nativeEmojiData } from '../../../../util/emoji';
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

const generateContacts = async (messageId: string, senders: Array<string>) => {
  let results = null;
  const message = await Data.getMessageById(messageId);
  if (message) {
    results = senders.map(sender => {
      const contact = message.findAndFormatContact(sender);
      return contact?.profileName || contact?.name || PubKey.shorten(sender);
    });
  }
  return results;
};

const renderContacts = (contacts: string) => {
  if (!contacts) {
    return;
  }

  if (contacts.includes('&') && contacts.includes('other')) {
    const [names, others] = contacts.split('&');
    return (
      <span>
        {names} & <span style={{ color: 'var(--color-accent' }}>{others}</span>{' '}
        {window.i18n('reactionTooltip')}
      </span>
    );
  }

  return (
    <span>
      {contacts} {window.i18n('reactionTooltip')}
    </span>
  );
};

type Props = {
  messageId: string;
  emoji: string;
  senders: Array<string>;
  tooltipPosition?: TipPosition;
  onClick: (...args: Array<any>) => void;
};

export const ReactionPopup = (props: Props): ReactElement => {
  const { messageId, emoji, senders, tooltipPosition = 'center', onClick } = props;

  const [contacts, setContacts] = useState('');

  useEffect(() => {
    let isCancelled = false;
    generateContacts(messageId, senders)
      .then(async results => {
        if (isCancelled) {
          return;
        }
        if (results && results.length > 0) {
          setContacts(readableList(results));
        }
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [generateContacts]);

  return (
    <StyledPopupContainer
      tooltipPosition={tooltipPosition}
      onClick={() => {
        onClick();
      }}
    >
      {renderContacts(contacts)}
      <StyledEmoji
        role={'img'}
        aria-label={nativeEmojiData?.ariaLabels ? nativeEmojiData.ariaLabels[emoji] : undefined}
      >
        {emoji}
      </StyledEmoji>
    </StyledPopupContainer>
  );
};
