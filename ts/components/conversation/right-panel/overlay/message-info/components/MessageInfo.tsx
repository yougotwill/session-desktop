import React from 'react';
import { Flex } from '../../../../../basic/Flex';
import { useSelector } from 'react-redux';
import { getMessageDetailsViewProps } from '../../../../../../state/selectors/conversations';
import moment from 'moment';
import { isEmpty } from 'lodash';
import { MessageFrom } from '.';
import styled from 'styled-components';
import { SpacerSM } from '../../../../../basic/Text';
import { ipcRenderer } from 'electron/renderer';

export const MessageInfoLabel = styled.label<{ color?: string }>`
  font-size: var(--font-size-lg);
  font-weight: bold;
  ${props => props.color && `color: ${props.color};`}
`;

const MessageInfoData = styled.div<{ color?: string }>`
  font-size: var(--font-size-md);
  user-select: text;
  ${props => props.color && `color: ${props.color};`}
`;

const LabelWithInfoContainer = styled.div`
  margin-bottom: var(--margins-md);
  ${props => props.onClick && 'cursor: pointer;'}
`;

type LabelWithInfoProps = {
  label: string;
  info: string;
  labelColor?: string;
  dataColor?: string;
  title?: string;
  onClick?: () => void;
};

export const LabelWithInfo = (props: LabelWithInfoProps) => {
  return (
    <LabelWithInfoContainer title={props.title || undefined} onClick={props.onClick}>
      <MessageInfoLabel color={props.labelColor}>{props.label}</MessageInfoLabel>
      <MessageInfoData color={props.dataColor}>{props.info}</MessageInfoData>
    </LabelWithInfoContainer>
  );
};

// Message timestamp format: "06:02 PM Tue, 15/11/2022"
const formatTimestamps = 'hh:mm A ddd, D/M/Y';

const showDebugLog = () => {
  ipcRenderer.send('show-debug-log');
};

export const MessageInfo = () => {
  const messageDetailProps = useSelector(getMessageDetailsViewProps);

  if (!messageDetailProps) {
    return null;
  }

  const { errors, receivedAt, sentAt, direction, sender } = messageDetailProps;

  const sentAtStr = `${moment(sentAt).format(formatTimestamps)}`;
  const receivedAtStr = `${moment(receivedAt).format(formatTimestamps)}`;

  const hasError = !isEmpty(errors);
  const errorString = hasError
    ? errors?.reduce((previous, current, currentIndex) => {
        return `${previous}${current.message}${
          errors.length > 1 && currentIndex < errors.length - 1 ? ', ' : ''
        }`;
      }, '')
    : null;

  return (
    <Flex container={true} flexDirection="column">
      <LabelWithInfo label={`${window.i18n('sent')}:`} info={sentAtStr} />
      {direction === 'incoming' ? (
        <LabelWithInfo label={`${window.i18n('received')}:`} info={receivedAtStr} />
      ) : null}
      <SpacerSM />
      <MessageFrom sender={sender} />
      {hasError && (
        <>
          <SpacerSM />
          <LabelWithInfo
            title={window.i18n('shareBugDetails')}
            label={`${window.i18n('error')}:`}
            info={errorString || window.i18n('unknownError')}
            dataColor={'var(--danger-color)'}
            onClick={showDebugLog}
          />
        </>
      )}
    </Flex>
  );
};
