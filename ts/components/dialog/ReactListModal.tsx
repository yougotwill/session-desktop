import { isEqual } from 'lodash';
import React, { useEffect, useState } from 'react';
import { ReactElement } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { updateReactListModal } from '../../state/ducks/modalDialog';
import { StateType } from '../../state/reducer';
import { getMessageReactsProps } from '../../state/selectors/conversations';
import { ReactionList } from '../../types/Message';
import { Avatar, AvatarSize } from '../avatar/Avatar';
import { Flex } from '../basic/Flex';
import { ContactName } from '../conversation/ContactName';
import { MessageReactions } from '../conversation/message/message-content/MessageReactions';
import { SessionWrapperModal } from '../SessionWrapperModal';

interface Props {
  messageId: string;
}

const StyledReactListContainer = styled(Flex)`
  width: 376px;
`;

const StyledReactionsContainer = styled.div`
  background-color: var(--color-cell-background);
  border-bottom: 1px solid var(--color-session-border);
  width: 100%;
  overflow-x: auto;
  padding: 12px 8px 0;
`;

const StyledSendersContainer = styled(Flex)`
  width: 100%;
  min-height: 350px;
  height: 100%;
  max-height: 496px;
  overflow-y: auto;
  padding: 0 16px 32px;
`;

const StyledReactionSummary = styled.p`
  margin: 12px 0 20px 4px;

  span {
    color: var(--color-text-subtle);
  }

  span:nth-child(1) {
    margin: 0 8px;
  }
`;

const StyledReactionSender = styled(Flex)`
  margin-bottom: 12px;
  .module-avatar {
    margin-right: 12px;
  }
`;

export const ReactListModal = (props: Props): ReactElement => {
  const { messageId = '' } = props;

  const dispatch = useDispatch();

  const msgProps = useSelector((state: StateType) => getMessageReactsProps(state, messageId));

  if (!msgProps) {
    return <></>;
  }

  const { reacts } = msgProps;
  const [reactions, setReactions] = useState<ReactionList>({});
  const [currentReact, setCurrentReact] = useState('');

  const handleSelectedReaction = (emoji: string): boolean => {
    return currentReact == emoji;
  };

  const handleReactionClick = (emoji: string) => {
    setCurrentReact(emoji);
  };

  const renderReactionSenders = (senders: Array<string>) => {
    return senders.map((sender: string) => (
      <StyledReactionSender alignItems={'center'}>
        <Avatar size={AvatarSize.XS} pubkey={sender} />
        <ContactName pubkey={sender} module="module-conversation__user" shouldShowPubkey={false} />
      </StyledReactionSender>
    ));
  };

  useEffect(() => {
    if (reacts && !isEqual(reactions, reacts)) {
      setReactions(reacts);
      setCurrentReact(Object.keys(reacts)[0]);
    }

    if (Object.keys(reactions).length > 0 && (reacts === {} || reacts === undefined)) {
      setReactions({});
    }
  }, [reacts, reactions]);

  return (
    <SessionWrapperModal
      additionalClassName={'reaction-list-modal'}
      showHeader={false}
      onClose={() => {
        dispatch(updateReactListModal(null));
      }}
    >
      <StyledReactListContainer container={true} flexDirection={'column'} alignItems={'flex-start'}>
        <StyledReactionsContainer>
          <MessageReactions
            messageId={messageId}
            hasReactLimit={false}
            inModal={true}
            onSelected={handleSelectedReaction}
            onClick={handleReactionClick}
          />
        </StyledReactionsContainer>
        {currentReact && (
          <StyledSendersContainer
            container={true}
            flexDirection={'column'}
            alignItems={'flex-start'}
          >
            <StyledReactionSummary>
              {currentReact}
              <span>&#8226;</span>
              <span>{reactions[currentReact].senders.length}</span>
            </StyledReactionSummary>
            {reactions[currentReact].senders &&
              reactions[currentReact].senders.length > 0 &&
              renderReactionSenders(reactions[currentReact].senders)}
          </StyledSendersContainer>
        )}
      </StyledReactListContainer>
    </SessionWrapperModal>
  );
};
