import React, { ReactNode } from 'react';
import styled from 'styled-components';
import { isMacOS } from '../OS';
import { Flex } from './basic/Flex';

// TODO Need to account for linux
export const titleBarHeight = 28;

const StyledTitleBarSpace = styled.div<{ isMac: boolean }>`
  width: 100vw;
  height: ${titleBarHeight}px;
  ${props => props.isMac && 'background-color: var(--background-primary-color);'}
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
`;

export const SessionWindow = ({ children }: { children: ReactNode }) => {
  const isMac = isMacOS();
  return (
    <Flex container={true} flexDirection={'column'}>
      <StyledTitleBarSpace isMac={isMac} />
      {children}
    </Flex>
  );
};
