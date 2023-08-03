import classNames from 'classnames';
import React, { useCallback } from 'react';
import { contextMenu } from 'react-contexify';

import { Avatar, AvatarSize } from '../../avatar/Avatar';

import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { openConversationWithMessages } from '../../../state/ducks/conversations';
import { updateUserDetailsModal } from '../../../state/ducks/modalDialog';

import _, { isNil } from 'lodash';
import {
  useAvatarPath,
  useConversationUsername,
  useHasUnread,
  useIsBlocked,
  useIsPrivate,
  useMentionedUs,
} from '../../../hooks/useParamSelector';
import { isSearching } from '../../../state/selectors/search';
import { useSelectedConversationKey } from '../../../state/selectors/selectedConversation';
import { MemoConversationListItemContextMenu } from '../../menu/ConversationListItemContextMenu';
import { ContextConversationProvider, useConvoIdFromContext } from './ConvoIdContext';
import { ConversationListItemHeaderItem } from './HeaderItem';
import { MessageItem } from './MessageItem';

type PropsHousekeeping = {
  style?: Object;
};
// tslint:disable: use-simple-attributes

type Props = { conversationId: string } & PropsHousekeeping;

const Portal = ({ children }: { children: any }) => {
  return createPortal(children, document.querySelector('.inbox.index') as Element);
};

const AvatarItem = () => {
  const conversationId = useConvoIdFromContext();
  const userName = useConversationUsername(conversationId);
  const isPrivate = useIsPrivate(conversationId);
  const avatarPath = useAvatarPath(conversationId);
  const dispatch = useDispatch();

  function onPrivateAvatarClick() {
    dispatch(
      updateUserDetailsModal({
        conversationId: conversationId,
        userName: userName || '',
        authorAvatarPath: avatarPath,
      })
    );
  }

  return (
    <div>
      <Avatar
        size={AvatarSize.S}
        pubkey={conversationId}
        onAvatarClick={isPrivate ? onPrivateAvatarClick : undefined}
      />
    </div>
  );
};

const ConversationListItemInner = (props: Props) => {
  const { conversationId, style } = props;
  const key = `conversation-item-${conversationId}`;

  const hasUnread = useHasUnread(conversationId);

  let hasUnreadMentionedUs = useMentionedUs(conversationId);
  let isBlocked = useIsBlocked(conversationId);
  const isSearch = useSelector(isSearching);
  const selectedConvo = useSelectedConversationKey();

  const isSelectedConvo = conversationId === selectedConvo && !isNil(selectedConvo);

  if (isSearch) {
    // force isBlocked and hasUnreadMentionedUs to be false, we just want to display the row without any special style when showing search results
    hasUnreadMentionedUs = false;
    isBlocked = false;
  }

  const triggerId = `${key}-ctxmenu`;

  const openConvo = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      // mousedown is invoked sooner than onClick, but for both right and left click
      if (e.button === 0) {
        await openConversationWithMessages({ conversationKey: conversationId, messageId: null });
      }
    },
    [conversationId]
  );

  return (
    <ContextConversationProvider value={conversationId}>
      <div key={key}>
        <div
          role="button"
          onMouseDown={openConvo}
          onMouseUp={e => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onContextMenu={e => {
            contextMenu.show({
              id: triggerId,
              event: e,
            });
          }}
          style={style}
          className={classNames(
            'module-conversation-list-item',
            hasUnread ? 'module-conversation-list-item--has-unread' : null,
            hasUnreadMentionedUs ? 'module-conversation-list-item--mentioned-us' : null,
            isSelectedConvo ? 'module-conversation-list-item--is-selected' : null,
            isBlocked ? 'module-conversation-list-item--is-blocked' : null
          )}
        >
          <AvatarItem />
          <div className="module-conversation-list-item__content">
            <ConversationListItemHeaderItem />
            <MessageItem />
          </div>
        </div>
        <Portal>
          <MemoConversationListItemContextMenu triggerId={triggerId} />
        </Portal>
      </div>
    </ContextConversationProvider>
  );
};

export const ConversationListItem = ConversationListItemInner;
