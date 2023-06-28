import React, { ReactNode } from 'react';
import styled, { CSSProperties } from 'styled-components';
import { Flex } from '../basic/Flex';

// NOTE Used for descendant components
export const StyledContent = styled.div<{ disabled: boolean }>`
  display: flex;
  align-items: center;
  flex-grow: 1;
  width: 100%;
  color: ${props => (props.disabled ? 'var(--disabled-color)' : 'inherit')};
`;

const StyledText = styled.span<{ color?: string }>`
  font-size: var(--font-size-md);
  font-weight: 500;
  margin-inline-start: var(--margins-lg);
  margin-inline-end: var(--margins-lg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  /* TODO needs RTL support */
  text-align: left;

  ${props => props.color && `color: ${props.color};`}
`;

export const PanelLabel = styled.p`
  color: var(--text-secondary-color);
  width: 100%;
  margin: 0;
  padding-left: calc(var(--margins-lg) * 2 + var(--margins-sm));
  padding-bottom: var(--margins-sm);
`;

const StyledRoundedPanelButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  background: var(--right-panel-item-background-color);
  border-radius: 16px;
  padding: 4px var(--margins-lg);
  width: -webkit-fill-available;
  flex-shrink: 0;
`;

const PanelButtonContainer = styled.div`
  overflow: auto;
  min-height: 40px;
  max-height: 100%;
`;

type PanelButtonGroupProps = {
  children: ReactNode;
  style?: CSSProperties;
};

export const PanelButtonGroup = (props: PanelButtonGroupProps) => {
  const { children, style } = props;
  return (
    <StyledRoundedPanelButtonGroup style={style}>
      <PanelButtonContainer>{children}</PanelButtonContainer>
    </StyledRoundedPanelButtonGroup>
  );
};

const StyledPanelButton = styled.button<{
  noBackgroundColor?: boolean;
  disabled: boolean;
}>`
  cursor: ${props => (props.disabled ? 'not-allowed' : 'pointer')};
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  flex-grow: 1;
  font-family: var(--font-default);
  padding: 0px var(--margins-sm);
  min-height: 50px;
  width: 100%;
  transition: var(--default-duration);
  background-color: ${props =>
    !props.noBackgroundColor ? 'var(--right-panel-item-background-hover-color) !important' : null};
  color: ${props => (props.disabled ? 'var(--disabled-color)' : 'inherit')};

  :not(:last-child) {
    border-bottom: 1px solid var(--border-color);
  }
`;

export type PanelButtonProps = {
  // https://styled-components.com/docs/basics#styling-any-component
  className?: string;
  disabled?: boolean;
  noBackgroundColor?: boolean;
  children: ReactNode;
  onClick: (...args: Array<any>) => void;
  dataTestId?: string;
  style?: CSSProperties;
};

export const PanelButton = (props: PanelButtonProps) => {
  const {
    className,
    disabled = false,
    noBackgroundColor,
    children,
    onClick,
    dataTestId,
    style,
  } = props;

  return (
    <StyledPanelButton
      className={className}
      noBackgroundColor={noBackgroundColor}
      disabled={disabled}
      onClick={onClick}
      style={style}
      data-testid={dataTestId}
    >
      {children}
    </StyledPanelButton>
  );
};

const StyledSubtitle = styled.p<{ color?: string }>`
  font-size: var(--font-size-xs);
  margin: 0;
  text-align: initial;

  ${props => props.color && `color: ${props.color};`}
`;

export const PanelButtonText = (props: { text: string; subtitle?: string; color?: string }) => {
  return (
    <Flex
      container={true}
      width={'100%'}
      flexDirection={'column'}
      alignItems={'flex-start'}
      margin="0 var(--margins-lg) 0 var(--margins-lg)"
      minWidth="0"
    >
      <StyledText color={props.color}>{props.text}</StyledText>
      {!!props.subtitle && <StyledSubtitle color={props.color}>{props.subtitle}</StyledSubtitle>}
    </Flex>
  );
};
