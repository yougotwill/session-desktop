import React, { ReactNode } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { isLinux, isWindows } from '../OS';
import { getFocusedSettingsSection } from '../state/selectors/section';
import { Flex } from './basic/Flex';

// 28 + 1 so we get the full border on windows
export const titleBarHeight = 29;

const StyledTitleBarSpace = styled.div<{ supportSettingsScreen: boolean }>`
  width: 100%;
  height: ${titleBarHeight}px;
  background-color: ${props =>
    props.supportSettingsScreen
      ? 'var(--background-secondary-color)'
      : 'var(--background-primary-color)'};
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
`;

export const SessionWindow = ({ children }: { children: ReactNode }) => {
  const onLinux = isLinux();
  const onWindows = isWindows();
  const focusedSettingsSection = useSelector(getFocusedSettingsSection);
  const supportSettingsScreen = onWindows && focusedSettingsSection !== undefined;

  // Electron doesn't support window control overlays on linux
  if (onLinux) {
    return(<>{children}</>);
  }

  return (
    <Flex container={true} flexDirection={'column'}>
      <StyledTitleBarSpace supportSettingsScreen={supportSettingsScreen} />
      {children}
    </Flex>
  );
};
