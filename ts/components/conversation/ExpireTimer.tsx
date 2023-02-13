import React, { useCallback, useState } from 'react';

import { getTimerBucketIcon } from '../../util/timer';

// tslint:disable-next-line: no-submodule-imports
import useInterval from 'react-use/lib/useInterval';
import styled from 'styled-components';
import { SessionIcon } from '../icon/SessionIcon';

type Props = {
  expirationLength: number;
  expirationTimestamp: number | null;
  isCorrectSide: boolean;
};

const ExpireTimerCount = styled.div<{
  color: string;
}>`
  margin-inline-start: 6px;
  font-size: var(--font-size-xs);
  line-height: 16px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  user-select: none;
  color: ${props => props.color};
  flex-shrink: 0;
`;

const ExpireTimerBucket = styled.div`
  margin-inline-start: 6px;
  font-size: var(--font-size-xs);
  line-height: 16px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  user-select: none;
  color: var(--text-primary-color);
`;

export const ExpireTimer = (props: Props) => {
  const { expirationLength, expirationTimestamp, isCorrectSide } = props;

  const initialTimeLeft = Math.max(Math.round(((expirationTimestamp || 0) - Date.now()) / 1000), 0);
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft);

  const update = useCallback(() => {
    if (expirationTimestamp) {
      const newTimeLeft = Math.max(Math.round((expirationTimestamp - Date.now()) / 1000), 0);
      if (newTimeLeft !== timeLeft) {
        setTimeLeft(newTimeLeft);
      }
    }
  }, [expirationTimestamp, timeLeft, setTimeLeft]);

  const updateFrequency = 500;
  useInterval(update, updateFrequency);

  if (!(isCorrectSide && expirationLength && expirationTimestamp)) {
    return null;
  }

  const expireTimerColor = 'var(--primary-text-color)';

  if (timeLeft <= 60) {
    return <ExpireTimerCount color={expireTimerColor}>{timeLeft}</ExpireTimerCount>;
  }

  const bucket = getTimerBucketIcon(expirationTimestamp, expirationLength);

  return (
    <ExpireTimerBucket>
      <SessionIcon iconType={bucket} iconSize="tiny" iconColor={expireTimerColor} />
    </ExpireTimerBucket>
  );
};
