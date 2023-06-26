import { isEmpty } from 'lodash';
import React from 'react';
import { TimerOptionsArray } from '../../../../../state/ducks/timerOptions';
import { PanelButtonGroup, PanelLabel } from '../../../../buttons/PanelButton';
import { PanelRadioButton } from '../../../../buttons/PanelRadioButton';

type TimerOptionsProps = {
  options: TimerOptionsArray | null;
  selected: number;
  setSelected: (value: number) => void;
  hasOnlyOneMode?: boolean;
  disabled?: boolean;
};

export const TimeOptions = (props: TimerOptionsProps) => {
  const { options, selected, setSelected, hasOnlyOneMode, disabled } = props;

  if (!options || isEmpty(options)) {
    return null;
  }

  return (
    <>
      {!hasOnlyOneMode && <PanelLabel>{window.i18n('timer')}</PanelLabel>}
      <PanelButtonGroup style={{ margin: '0 var(--margins-lg)' }}>
        {options.map(option => {
          return (
            <PanelRadioButton
              key={option.name}
              text={option.name}
              value={option.name}
              isSelected={selected === option.value}
              onSelect={() => {
                setSelected(option.value);
              }}
              noBackgroundColor={true}
              disabled={disabled}
              dataTestId={`disappear-time-${option.value}-option`}
            />
          );
        })}
      </PanelButtonGroup>
    </>
  );
};
