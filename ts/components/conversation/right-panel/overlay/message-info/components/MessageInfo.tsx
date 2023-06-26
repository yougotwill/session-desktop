import React from 'react';
import { Flex } from '../../../../../basic/Flex';
import { useSelector } from 'react-redux';
import { getMessageDetailsViewProps } from '../../../../../../state/selectors/conversations';
import moment from 'moment';
import { isEmpty } from 'lodash';
import { MessageFrom } from '.';
import styled from 'styled-components';
import { SpacerSM } from '../../../../../basic/Text';

export const MessageInfoLabel = styled.label`
  font-size: var(--font-size-lg);
  font-weight: bold;
`;

const MessageInfoData = styled.div`
  font-size: var(--font-size-md);
  user-select: text;
`;

const LabelWithInfoContainer = styled.div`
  margin-bottom: var(--margins-md);
`;

type LabelWithInfoProps = { label: string; info: string };

export const LabelWithInfo = (props: LabelWithInfoProps) => {
  return (
    <LabelWithInfoContainer>
      <MessageInfoLabel>{props.label}</MessageInfoLabel>
      <MessageInfoData>{props.info}</MessageInfoData>
    </LabelWithInfoContainer>
  );
};

// Message timestamp format: "06:02 PM Tue, 15/11/2022"
const formatTimestamps = 'hh:mm A ddd, D/M/Y';

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
    ? errors?.reduce((previous, current) => {
        return `${previous} ${current.name}: "${current.message}";`;
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
          <LabelWithInfo label={window.i18n('error')} info={errorString || 'Unknown error'} />
        </>
      )}
    </Flex>
  );
};
