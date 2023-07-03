import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { OpenGroupData } from '../../../../data/opengroups';
import { MessageRenderingProps } from '../../../../models/messageType';
import { findCachedBlindedMatchOrLookItUp } from '../../../../session/apis/open_group_api/sogsv3/knownBlindedkeys';
import { getConversationController } from '../../../../session/conversations';
import { getSodiumRenderer } from '../../../../session/crypto';
import { PubKey } from '../../../../session/types';
import { openConversationWithMessages } from '../../../../state/ducks/conversations';
import { updateUserDetailsModal } from '../../../../state/ducks/modalDialog';
import {
  useAuthorAvatarPath,
  useAuthorName,
  useAuthorProfileName,
  useLastMessageOfSeries,
  useMessageAuthor,
  useMessageSenderIsAdmin,
} from '../../../../state/selectors/';
import {
  getSelectedCanWrite,
  useSelectedConversationKey,
  useSelectedIsPublic,
} from '../../../../state/selectors/conversations';
import { Avatar, AvatarSize, CrownIcon } from '../../../avatar/Avatar';
// tslint:disable: use-simple-attributes

const StyledAvatar = styled.div`
  position: relative;
  margin-inline-end: 20px;
  padding-bottom: 6px;
  padding-inline-end: 4px;
`;

export type MessageAvatarSelectorProps = Pick<
  MessageRenderingProps,
  'sender' | 'isSenderAdmin' | 'lastMessageOfSeries'
>;

type Props = { messageId: string; noAvatar: boolean };

export const MessageAvatar = (props: Props) => {
  const { messageId, noAvatar } = props;

  const dispatch = useDispatch();
  const selectedConvoKey = useSelectedConversationKey();

  const isTypingEnabled = useSelector(getSelectedCanWrite);
  const isPublic = useSelectedIsPublic();
  const authorName = useAuthorName(messageId);
  const authorProfileName = useAuthorProfileName(messageId);
  const authorAvatarPath = useAuthorAvatarPath(messageId);
  const sender = useMessageAuthor(messageId);
  const lastMessageOfSeries = useLastMessageOfSeries(messageId);
  const isSenderAdmin = useMessageSenderIsAdmin(messageId);

  if (noAvatar || !sender) {
    return null;
  }

  const userName = authorName || authorProfileName || sender;

  const onMessageAvatarClick = useCallback(async () => {
    if (isPublic && !PubKey.hasBlindedPrefix(sender)) {
      // public chat but session id not blinded. disable showing user details if we do not have an active convo with that user.
      // an unactive convo with that user means that we never chatted with that id directyly, but only through a sogs
      const convoWithSender = getConversationController().get(sender);
      if (!convoWithSender || !convoWithSender.get('active_at')) {
        // for some time, we might still get some unblinded messages, as in message sent unblinded because
        //    * older clients still send unblinded message and those are allowed by sogs if they doesn't enforce blinding
        //    * new clients still send unblinded message and those are allowed by sogs if it doesn't enforce blinding
        // we want to not allow users to open user details dialog when that's the case.
        // to handle this case, we can drop the click on avatar if the conversation with that user is not active.
        window.log.info(
          'onMessageAvatarClick: public unblinded message and sender convo is not active. Dropping click event'
        );
        return;
      }
    }

    if (isPublic && !isTypingEnabled) {
      window.log.info('onMessageAvatarClick: typing is disabled...');
      return;
    }

    if (isPublic && selectedConvoKey) {
      const convoOpen = getConversationController().get(selectedConvoKey);
      const room = OpenGroupData.getV2OpenGroupRoom(convoOpen.id);
      let privateConvoToOpen = sender;
      if (room?.serverPublicKey) {
        const foundRealSessionId = await findCachedBlindedMatchOrLookItUp(
          sender,
          room.serverPublicKey,
          await getSodiumRenderer()
        );

        privateConvoToOpen = foundRealSessionId || privateConvoToOpen;
      }

      await getConversationController()
        .get(privateConvoToOpen)
        .setOriginConversationID(selectedConvoKey);

      // public and blinded key for that message, we should open the convo as is and see if the user wants
      // to send a sogs blinded message request.
      await openConversationWithMessages({ conversationKey: privateConvoToOpen, messageId: null });

      return;
    }
    //not public, i.e. closed group. Just open dialog for the user to do what he wants
    dispatch(
      updateUserDetailsModal({
        conversationId: sender,
        userName,
        authorAvatarPath,
      })
    );
  }, [userName, sender, isPublic, authorAvatarPath, selectedConvoKey]);

  if (!lastMessageOfSeries) {
    return <div style={{ marginInlineEnd: '60px' }} key={`msg-avatar-${sender}`} />;
  }

  return (
    <StyledAvatar key={`msg-avatar-${sender}`}>
      <Avatar size={AvatarSize.S} onAvatarClick={onMessageAvatarClick} pubkey={sender} />
      {isSenderAdmin && <CrownIcon />}
    </StyledAvatar>
  );
};
