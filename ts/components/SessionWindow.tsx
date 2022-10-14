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
  cursor: grab;
`;

type SessionWindowProps = {
  children: ReactNode;
  supportSettingsScreen?: boolean;
};

export const SessionWindow = (props: SessionWindowProps) => {
  const { children, supportSettingsScreen = false } = props;
  const onLinux = isLinux();

  // Electron doesn't support window control overlays on linux
  if (onLinux) {
    return <>{children}</>;
  }

  return (
    <Flex container={true} flexDirection={'column'}>
      <StyledTitleBarSpace
        aria-aria-label="Session App Menu Bar"
        supportSettingsScreen={supportSettingsScreen}
      />
      {children}
    </Flex>
  );
};

// Used where we have access to the redux store
export const SmartSessionWindow = (props: SessionWindowProps) => {
  const { children } = props;
  const onWindows = isWindows();
  const focusedSettingsSection = useSelector(getFocusedSettingsSection);
  const supportSettingsScreen = Boolean(onWindows && focusedSettingsSection);

  return <SessionWindow supportSettingsScreen={supportSettingsScreen}>{children}</SessionWindow>;
};
