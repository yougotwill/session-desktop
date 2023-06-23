import React from 'react';
import { SessionIcon, SessionIconType } from '../icon';
import { PanelButton, PanelButtonProps, PanelButtonText, StyledContent } from './PanelButton';
import styled from 'styled-components';

interface PanelIconButton extends Omit<PanelButtonProps, 'children'> {
  iconType: SessionIconType;
  text: string;
  subtitle?: string;
}

const IconContainer = styled.div`
  flex-shrink: 0;
  width: var(--toggle-width);
`;

export const PanelIconButton = (props: PanelIconButton) => {
  const {
    iconType,
    text,
    subtitle,
    disabled = false,
    noBackgroundColor,
    onClick,
    dataTestId,
  } = props;

  return (
    <PanelButton
      disabled={disabled}
      noBackgroundColor={noBackgroundColor}
      onClick={onClick}
      dataTestId={dataTestId}
    >
      <StyledContent disabled={disabled}>
        <IconContainer>
          <SessionIcon iconType={iconType} iconSize="medium" />
        </IconContainer>
        <PanelButtonText text={text} subtitle={subtitle} />
      </StyledContent>
    </PanelButton>
  );
};
