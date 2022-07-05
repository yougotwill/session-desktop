import React, { ReactElement } from 'react';
import styled from 'styled-components';
import { SessionIconButton } from '../../../icon';

type Props = {
  action: (...args: any[]) => void;
};

const StyledMessageReactBar = styled.div`
  background-color: var(--color-received-message-background);
  border-radius: 25px;
  box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.2), 0 0px 20px 0 rgba(0, 0, 0, 0.19);

  position: absolute;
  top: -56px;
  padding: 4px 8px;
  white-space: nowrap;
  width: 302px;

  display: flex;
  align-items: center;

  .session-icon-button {
    border-color: transparent !important;
    box-shadow: none !important;
    margin: 0 4px;
  }
`;

const ReactButton = styled.span`
  padding: 2px 8px;
  border-radius: 300px;
  cursor: pointer;
  font-size: 24px;

  :hover {
    background-color: var(--color-compose-view-button-background);
  }
`;

export const MessageReactBar = (props: Props): ReactElement => {
  const { action } = props;

  return (
    <StyledMessageReactBar>
      <ReactButton>🙈</ReactButton>
      <ReactButton>🙉</ReactButton>
      <ReactButton>🙊</ReactButton>
      <ReactButton>😈</ReactButton>
      <ReactButton>🥸</ReactButton>
      <ReactButton>🐀</ReactButton>
      <SessionIconButton
        iconColor={'var(--color-text)'}
        iconPadding={'12px'}
        iconSize={'huge2'}
        iconType="plusThin"
        backgroundColor={'var(--color-compose-view-button-background)'}
        borderRadius="300px"
        onClick={action}
      />
    </StyledMessageReactBar>
  );
};
