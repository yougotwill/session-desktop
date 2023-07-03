import React from 'react';

import { TypingAnimation } from './TypingAnimation';
import styled from 'styled-components';
import { ConversationTypeEnum } from '../../models/conversationAttributes';
import { useSelectedIsGroup } from '../../state/selectors/conversations';

interface TypingBubbleProps {
  conversationType: ConversationTypeEnum;
  isTyping: boolean;
}

const TypingBubbleContainer = styled.div<TypingBubbleProps>`
  height: ${props => (props.isTyping ? 'auto' : '0px')};
  display: flow-root;
  padding-bottom: ${props => (props.isTyping ? '4px' : '0px')};
  padding-top: ${props => (props.isTyping ? '4px' : '0px')};
  transition: var(--default-duration);
  padding-inline-end: 16px;
  padding-inline-start: 4px;
  overflow: hidden;
  flex-shrink: 0;
`;

export const TypingBubble = (props: TypingBubbleProps) => {
  const isOpenOrClosedGroup = useSelectedIsGroup();
  if (!isOpenOrClosedGroup || !props.isTyping) {
    return null;
  }

  return (
    <TypingBubbleContainer {...props}>
      <TypingAnimation />
    </TypingBubbleContainer>
  );
};
