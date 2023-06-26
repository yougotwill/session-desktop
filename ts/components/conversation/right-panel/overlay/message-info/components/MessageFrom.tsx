import React from 'react';
import styled from 'styled-components';
import { useConversationUsername } from '../../../../../../hooks/useParamSelector';
import { Avatar, AvatarSize } from '../../../../../avatar/Avatar';
import { MessageInfoLabel } from '.';

const StyledFromContainer = styled.div`
  display: flex;
  gap: var(--margins-lg);
  align-items: center;
  padding: var(--margins-xs);
`;
const StyledAuthorNamesContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const Name = styled.span`
  font-weight: bold;
`;
const Pubkey = styled.span`
  font-family: var(--font-font-mono);
  font-size: var(--font-size-md);
  user-select: text;
`;

const StyledMessageInfoAuthor = styled.div`
  font-size: var(--font-size-lg);
`;

export const MessageFrom = (props: { sender: string }) => {
  const { sender } = props;
  const profileName = useConversationUsername(sender);
  const from = window.i18n('from');

  return (
    <StyledMessageInfoAuthor>
      <MessageInfoLabel>{from}</MessageInfoLabel>
      <StyledFromContainer>
        <Avatar size={AvatarSize.M} pubkey={sender} onAvatarClick={undefined} />
        <StyledAuthorNamesContainer>
          {!!profileName && <Name>{profileName}</Name>}
          <Pubkey>{sender}</Pubkey>
        </StyledAuthorNamesContainer>
      </StyledFromContainer>
    </StyledMessageInfoAuthor>
  );
};
