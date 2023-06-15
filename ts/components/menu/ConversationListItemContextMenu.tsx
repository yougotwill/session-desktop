import _ from 'lodash';
import React from 'react';
import { animation, Item, Menu } from 'react-contexify';

import { useSelector } from 'react-redux';
import { useIsPinned, useIsPrivate, useIsPrivateAndFriend } from '../../hooks/useParamSelector';
import { getConversationController } from '../../session/conversations';
import { getIsMessageSection } from '../../state/selectors/section';
import { useConvoIdFromContext } from '../leftpane/conversation-list-item/ConvoIdContext';
import { SessionContextMenuContainer } from '../SessionContextMenuContainer';
import {
  AcceptMsgRequestMenuItem,
  BanMenuItem,
  BlockMenuItem,
  ChangeNicknameMenuItem,
  ClearNicknameMenuItem,
  CopyMenuItem,
  DeclineAndBlockMsgRequestMenuItem,
  DeclineMsgRequestMenuItem,
  DeleteMessagesMenuItem,
  InviteContactMenuItem,
  LeaveGroupOrCommunityMenuItem,
  MarkAllReadMenuItem,
  MarkConversationUnreadMenuItem,
  ShowUserDetailsMenuItem,
  UnbanMenuItem,
  DeletePrivateConversationMenuItem,
} from './Menu';
import { isSearching } from '../../state/selectors/search';

export type PropsContextConversationItem = {
  triggerId: string;
};

const ConversationListItemContextMenu = (props: PropsContextConversationItem) => {
  const { triggerId } = props;
  const isSearchingMode = useSelector(isSearching);

  if (isSearchingMode) {
    return null;
  }

  return (
    <SessionContextMenuContainer>
      <Menu id={triggerId} animation={animation.fade}>
        {/* Message request related actions */}
        <AcceptMsgRequestMenuItem />
        <DeclineMsgRequestMenuItem />
        <DeclineAndBlockMsgRequestMenuItem />
        {/* Generic actions */}
        <PinConversationMenuItem />
        <BlockMenuItem />
        <CopyMenuItem />
        {/* Read state actions */}
        <MarkAllReadMenuItem />
        <MarkConversationUnreadMenuItem />
        {/* Nickname actions */}
        <ChangeNicknameMenuItem />
        <ClearNicknameMenuItem />
        {/* Communities actions */}
        <BanMenuItem />
        <UnbanMenuItem />
        <InviteContactMenuItem />
        <DeleteMessagesMenuItem />
        <DeletePrivateConversationMenuItem />
        <LeaveGroupOrCommunityMenuItem />
        <ShowUserDetailsMenuItem />
      </Menu>
    </SessionContextMenuContainer>
  );
};

function propsAreEqual(prev: PropsContextConversationItem, next: PropsContextConversationItem) {
  return _.isEqual(prev, next);
}
export const MemoConversationListItemContextMenu = React.memo(
  ConversationListItemContextMenu,
  propsAreEqual
);

export const PinConversationMenuItem = (): JSX.Element | null => {
  const conversationId = useConvoIdFromContext();
  const isMessagesSection = useSelector(getIsMessageSection);
  const isPrivateAndFriend = useIsPrivateAndFriend(conversationId);
  const isPrivate = useIsPrivate(conversationId);
  const isPinned = useIsPinned(conversationId);

  if (isMessagesSection && (!isPrivate || (isPrivate && isPrivateAndFriend))) {
    const conversation = getConversationController().get(conversationId);

    const togglePinConversation = async () => {
      await conversation?.togglePinned();
    };

    const menuText = isPinned ? window.i18n('unpinConversation') : window.i18n('pinConversation');
    return <Item onClick={togglePinConversation}>{menuText}</Item>;
  }
  return null;
};
