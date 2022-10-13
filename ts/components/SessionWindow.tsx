import React, { ReactNode } from 'react';
import styled from 'styled-components';
import { Flex } from './basic/Flex';

export const titleBarHeight = 28;

const StyledTitleBarSpace = styled.div`
  width: 100%;
  height: ${titleBarHeight}px;
  background-color: var(--background-primary-color);
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
`;

export const SessionWindow = ({ children }: { children: ReactNode }) => {
  return (
    <Flex container={true} flexDirection={'column'}>
      <StyledTitleBarSpace />
      {children}
    </Flex>
  );
};
