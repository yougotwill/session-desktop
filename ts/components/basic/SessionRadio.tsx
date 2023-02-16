import React, { ChangeEvent } from 'react';
import styled from 'styled-components';
import { Flex } from '../basic/Flex';
// tslint:disable: react-unused-props-and-state

const StyledInput = styled.input<{
  filledSize: number;
  outlineOffset: number;
  selectedColor?: string;
}>`
  opacity: 0;
  position: absolute;
  cursor: ${props => (props.disabled ? 'not-allowed' : 'pointer')};
  width: ${props => props.filledSize + props.outlineOffset}px;
  height: ${props => props.filledSize + props.outlineOffset}px;

  :checked + label:before {
    background: ${props =>
      props.disabled
        ? 'var(--disabled-color)'
        : props.selectedColor
        ? props.selectedColor
        : 'var(--primary-color)'};
  }
`;
// tslint:disable: use-simple-attributes

const StyledLabel = styled.label<{
  disabled: boolean;
  filledSize: number;
  outlineOffset: number;
  beforeMargins?: string;
}>`
  cursor: pointer;
  color: ${props => (props.disabled ? 'var(--disabled-color)' : 'var(--text-primary-color)')};

  :before {
    content: '';
    display: inline-block;
    border-radius: 100%;

    transition: var(--default-duration);
    padding: ${props => props.filledSize}px;
    border: none;
    outline: 1px solid currentColor; /* CSS variables don't work here */
    outline-offset: ${props => props.outlineOffset}px;
    ${props => props.beforeMargins && `margin: ${props.beforeMargins};`};
  }
`;

type SessionRadioProps = {
  label: string;
  value: string;
  active: boolean;
  inputName?: string;
  beforeMargins?: string;
  onClick?: (value: string) => void;
  disabled?: boolean;
};

export const SessionRadio = (props: SessionRadioProps) => {
  const { label, inputName, value, active, onClick, beforeMargins, disabled = false } = props;

  const clickHandler = (e: ChangeEvent<any>) => {
    if (!disabled && onClick) {
      // let something else catch the event if our click handler is not set
      e.stopPropagation();
      onClick(value);
    }
  };

  const filledSize = 15 / 2;
  const outlineOffset = 2;

  return (
    <Flex container={true} padding="0 0 0 var(--margins-lg)">
      <StyledInput
        type="radio"
        name={inputName || ''}
        value={value}
        aria-checked={active}
        checked={active}
        onChange={clickHandler}
        filledSize={filledSize * 2}
        outlineOffset={outlineOffset}
        disabled={disabled}
        data-testid={`input-${value}`}
      />
      <StyledLabel
        role="button"
        onClick={clickHandler}
        filledSize={filledSize - 1}
        outlineOffset={outlineOffset}
        beforeMargins={beforeMargins}
        aria-label={label}
        disabled={disabled}
        data-testid={`label-${value}`}
      >
        {label}
      </StyledLabel>
    </Flex>
  );
};

const StyledInputOutlineSelected = styled(StyledInput)`
  color: ${props => (props.disabled ? 'var(--disabled-color)' : 'var(--text-primary-color)')};
  label:before,
  label:before {
    outline: none;
  }
  :checked + label:before {
    outline: 1px solid currentColor;
  }
`;
const StyledLabelOutlineSelected = styled(StyledLabel)<{ selectedColor: string }>`
  :before {
    background: ${props =>
      props.disabled
        ? 'var(--disabled-color)'
        : props.selectedColor
        ? props.selectedColor
        : 'var(--primary-color)'};
    outline: 1px solid transparent; /* CSS variables don't work here */
  }
`;

/**
 * Keeping this component here so we can reuse the `StyledInput` and `StyledLabel` defined locally rather than exporting them
 */
export const SessionRadioPrimaryColors = (props: {
  value: string;
  active: boolean;
  inputName?: string;
  onClick: (value: string) => void;
  ariaLabel: string;
  color: string; // by default, we use the theme accent color but for the settings screen we need to be able to force it
  disabled?: boolean;
}) => {
  const { inputName, value, active, onClick, color, ariaLabel, disabled = false } = props;

  function clickHandler(e: ChangeEvent<any>) {
    e.stopPropagation();
    onClick(value);
  }

  const filledSize = 31 / 2;
  const outlineOffset = 5;

  return (
    <Flex container={true} padding="0 0 5px 0">
      <StyledInputOutlineSelected
        type="radio"
        name={inputName || ''}
        value={value}
        aria-checked={active}
        checked={active}
        onChange={clickHandler}
        filledSize={filledSize}
        outlineOffset={outlineOffset}
        selectedColor={color}
        aria-label={ariaLabel}
        disabled={disabled}
      />

      <StyledLabelOutlineSelected
        role="button"
        onClick={clickHandler}
        selectedColor={color}
        filledSize={filledSize}
        outlineOffset={outlineOffset}
        disabled={disabled}
      >
        {''}
      </StyledLabelOutlineSelected>
    </Flex>
  );
};
