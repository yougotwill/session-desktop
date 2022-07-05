import React, { ReactElement } from 'react';
import styled from 'styled-components';

export type TipPosition = 'center' | 'left' | 'right';

export const StyledPopupContainer = styled.div<{ tooltipPosition: TipPosition }>`
  display: flex;
  align-items: center;
  width: 216px;
  height: 72px;
  z-index: 150;

  background-color: var(--color-received-message-background);
  color: var(--color-pill-divider-text);
  box-shadow: 0px 0px 13px rgba(0, 0, 0, 0.51);
  font-size: 12px;
  font-weight: 600;
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
  emoji: string;
  senders: Array<string>;
  tooltipPosition?: TipPosition;
  onClick: (...args: any[]) => void;
}

export const MessageReactionPopup = (props: Props): ReactElement => {
  const { emoji, senders, tooltipPosition = 'center', onClick } = props;

  return (
    <StyledPopupContainer
      tooltipPosition={tooltipPosition}
      onClick={() => {
        onClick();
      }}
    >
      <span>Josh, Alex, cornkdog & 3 others reacted with </span>
      <StyledEmoji>{emoji}</StyledEmoji>
    </StyledPopupContainer>
  );
};
