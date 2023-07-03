import React from 'react';
import styled from 'styled-components';
import { PubKey } from '../../../../session/types';
import {
  useAuthorName,
  useAuthorProfileName,
  useFirstMessageOfSeries,
  useMessageAuthor,
  useMessageDirection,
} from '../../../../state/selectors';
import { useSelectedIsGroup, useSelectedIsPublic } from '../../../../state/selectors/conversations';
import { Flex } from '../../../basic/Flex';
import { ContactName } from '../../ContactName';

type Props = {
  messageId: string;
};

const StyledAuthorContainer = styled(Flex)`
  color: var(--text-primary-color);
`;

export const MessageAuthorText = (props: Props) => {
  const isPublic = useSelectedIsPublic();
  const isGroup = useSelectedIsGroup();
  const authorProfileName = useAuthorProfileName(props.messageId);
  const authorName = useAuthorName(props.messageId);
  const sender = useMessageAuthor(props.messageId);
  const direction = useMessageDirection(props.messageId);
  const firstMessageOfSeries = useFirstMessageOfSeries(props.messageId);

  if (!props.messageId || !sender || !direction) {
    return null;
  }

  const title = authorName ? authorName : sender;

  if (direction !== 'incoming' || !isGroup || !title || !firstMessageOfSeries) {
    return null;
  }

  const displayedPubkey = authorProfileName ? PubKey.shorten(sender) : sender;

  return (
    <StyledAuthorContainer container={true}>
      <ContactName
        pubkey={displayedPubkey}
        name={authorName}
        profileName={authorProfileName}
        module="module-message__author"
        boldProfileName={true}
        shouldShowPubkey={Boolean(isPublic)}
      />
    </StyledAuthorContainer>
  );
};
