import classNames from 'classnames';

import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { isOpenOrClosedGroup } from '../../../../models/conversationAttributes';
import { MessageRenderingProps } from '../../../../models/messageType';
import { StateType } from '../../../../state/reducer';
import {
  getMessageTextProps,
  isMessageSelectionMode,
} from '../../../../state/selectors/conversations';
import { SessionIcon } from '../../../icon';
import { MessageBody } from './MessageBody';
import { useMessageDirection } from '../../../../state/selectors';

type Props = {
  messageId: string;
};

export type MessageTextSelectorProps = Pick<
  MessageRenderingProps,
  'text' | 'direction' | 'status' | 'isDeleted' | 'conversationType'
>;

const StyledMessageText = styled.div<{ isDeleted?: boolean }>`
  white-space: pre-wrap;

  svg {
    margin-inline-end: var(--margins-xs);
  }

  ${({ isDeleted }) =>
    isDeleted &&
    `
    display: flex;
    align-items: center;
    `}
`;

export const MessageText = (props: Props) => {
  const selected = useSelector((state: StateType) => getMessageTextProps(state, props.messageId));
  const multiSelectMode = useSelector(isMessageSelectionMode);
  const direction = useMessageDirection(props.messageId);

  if (!selected) {
    return null;
  }
  const { text, isDeleted, conversationType } = selected;

  const contents = isDeleted ? window.i18n('deleteMessageDeletedGlobally') : text?.trim();

  if (!contents) {
    return null;
  }

  const iconColor =
    direction === 'incoming'
      ? 'var(--message-bubbles-received-text-color)'
      : 'var(--message-bubbles-sent-text-color)';

  return (
    <StyledMessageText
      dir="auto"
      className={classNames('module-message__text')}
      isDeleted={isDeleted}
    >
      {isDeleted && <SessionIcon iconType="delete" iconSize="small" iconColor={iconColor} />}
      <MessageBody
        text={contents || ''}
        disableLinks={multiSelectMode}
        disableJumbomoji={false}
        isGroup={isOpenOrClosedGroup(conversationType)}
      />
    </StyledMessageText>
  );
};
