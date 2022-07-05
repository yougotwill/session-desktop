import React, { ReactElement } from 'react';
import styled from 'styled-components';

export const StyledPopupContainer = styled.div`
  display: flex;
  align-items: center;
  width: 216px;
  height: 72px;

  background-color: var(--color-compose-view-button-background);
  color: var(--color-pill-divider-text);
  font-size: 12px;
  font-weight: 600;
  padding: 16px;
  border-radius: 12px;
  cursor: pointer;

  &:after {
    content: '';
    position: absolute;
    top: calc(100% - 18px);
    left: calc(100% - 100px);
    width: 22px;
    height: 22px;
    background-color: var(--color-compose-view-button-background);
    transform: rotate(45deg);
    border-radius: 3px;
    transform: scaleY(1.4) rotate(45deg);
    clip-path: polygon(100% 100%, 7.2px 100%, 100% 7.2px);
    box-shadow: 0px 0px 9px rgba(0, 0, 0, 0.51); /* theme relative color */
  }
`;

const StyledEmoji = styled.span`
  font-size: 36px;
  margin-left: 8px;
`;

interface Props {
  emoji: string;
  senders: Array<string>;
  onClick: (...args: any[]) => void;
}

export const MessageReactionPopup = (props: Props): ReactElement => {
  const { emoji, senders, onClick} = props;

  return (
    <StyledPopupContainer
      onClick={() => {
        onClick();
      }}
    >
      <span>Josh, Alex, cornkdog & 3 others reacted with </span>
      <StyledEmoji>{emoji}</StyledEmoji>
    </StyledPopupContainer>
  );
};
