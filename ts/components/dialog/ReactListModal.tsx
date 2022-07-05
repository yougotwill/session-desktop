import { isEqual } from 'lodash';
import React, { ReactElement, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { getMessageById } from '../../data/data';
import { UserUtils } from '../../session/utils';
import { updateReactListModal, updateUserDetailsModal } from '../../state/ducks/modalDialog';
import { StateType } from '../../state/reducer';
import { getMessageReactsProps } from '../../state/selectors/conversations';
import { ReactionList } from '../../types/Message';
import { Avatar, AvatarSize } from '../avatar/Avatar';
import { Flex } from '../basic/Flex';
import { ContactName } from '../conversation/ContactName';
import { MessageReactions } from '../conversation/message/message-content/MessageReactions';
import { SessionWrapperModal } from '../SessionWrapperModal';

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

type Props = {
  messageId: string;
};

export const ReactListModal = (props: Props): ReactElement => {
  const { messageId } = props;
  const msgProps = useSelector((state: StateType) => getMessageReactsProps(state, messageId));

  if (!msgProps) {
    return <></>;
  }

  const dispatch = useDispatch();

  const me = UserUtils.getOurPubKeyStrFromCache();
  const { reacts } = msgProps;
  const [reactions, setReactions] = useState<ReactionList>({});
  const [currentReact, setCurrentReact] = useState('');
  const [senders, setSenders] = useState<Array<string>>([]);

  const handleSelectedReaction = (emoji: string): boolean => {
    return currentReact === emoji;
  };

  const handleReactionClick = (emoji: string) => {
    setCurrentReact(emoji);
  };

  const handleClose = () => {
    dispatch(updateReactListModal(null));
  };

  const handleAvatarClick = async (sender: string) => {
    const message = await getMessageById(messageId);
    if (message) {
      handleClose();
      const contact = message.findAndFormatContact(sender);
      dispatch(
        updateUserDetailsModal({
          conversationId: sender,
          userName: contact.name || contact.profileName || sender,
          authorAvatarPath: contact.avatarPath,
        })
      );
    }
  };

  const renderReactionSenders = (senders: Array<string>) => {
    return senders.map((sender: string) => (
      <StyledReactionSender alignItems={'center'}>
        <Avatar
          size={AvatarSize.XS}
          pubkey={sender}
          onAvatarClick={async () => {
            await handleAvatarClick(sender);
          }}
        />
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

    if (currentReact && senders && !isEqual(senders, reactions[currentReact].senders)) {
      let _senders = [...reactions[currentReact].senders];
      if (_senders.length > 1) {
        const meIndex = _senders.indexOf(me);
        if (meIndex >= 0) {
          _senders.splice(meIndex, 1);
          _senders = [me, ..._senders];
        }
      }
      setSenders(_senders);
    }

    if (
      senders.length > 0 &&
      (reactions[currentReact].senders === [] || reactions[currentReact].senders === undefined)
    ) {
      setSenders([]);
    }
  }, [currentReact, reacts, reactions, senders]);

  return (
    <SessionWrapperModal
      additionalClassName={'reaction-list-modal'}
      showHeader={false}
      onClose={handleClose}
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
              <span>{senders.length}</span>
            </StyledReactionSummary>
            {senders && senders.length > 0 && renderReactionSenders(senders)}
          </StyledSendersContainer>
        )}
      </StyledReactListContainer>
    </SessionWrapperModal>
  );
};
