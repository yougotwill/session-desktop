import { debounce, noop } from 'lodash';
import React, { useCallback, useContext, useLayoutEffect, useState } from 'react';
import { InView } from 'react-intersection-observer';
import { useDispatch, useSelector } from 'react-redux';
import { Data } from '../../../../data/data';
import { useHasUnread } from '../../../../hooks/useParamSelector';
import { getConversationController } from '../../../../session/conversations';
import {
  fetchBottomMessagesForConversation,
  fetchTopMessagesForConversation,
  markConversationFullyRead,
  showScrollToBottomButton,
} from '../../../../state/ducks/conversations';
import {
  areMoreMessagesBeingFetched,
  getLoadedMessagesLength,
  getMostRecentMessageId,
  getOldestMessageId,
  getQuotedMessageToAnimate,
  getShowScrollButton,
  getYoungestMessageId,
  useSelectedConversationKey,
} from '../../../../state/selectors/conversations';
import { getIsAppFocused } from '../../../../state/selectors/section';
import { ScrollToLoadedMessageContext } from '../../SessionMessagesListContainer';

export type ReadableMessageProps = {
  children: React.ReactNode;
  messageId: string;
  className?: string;
  receivedAt: number | undefined;
  isUnread: boolean;
  dataTestId?: string;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
};

const debouncedTriggerLoadMoreTop = debounce(
  (selectedConversationKey: string, oldestMessageId: string) => {
    (window.inboxStore?.dispatch as any)(
      fetchTopMessagesForConversation({
        conversationKey: selectedConversationKey,
        oldTopMessageId: oldestMessageId,
      })
    );
  },
  100
);

const debouncedTriggerLoadMoreBottom = debounce(
  (selectedConversationKey: string, youngestMessageId: string) => {
    (window.inboxStore?.dispatch as any)(
      fetchBottomMessagesForConversation({
        conversationKey: selectedConversationKey,
        oldBottomMessageId: youngestMessageId,
      })
    );
  },
  100
);

export const ReadableMessage = (props: ReadableMessageProps) => {
  const { messageId, onContextMenu, className, receivedAt, isUnread, dataTestId } = props;

  const isAppFocused = useSelector(getIsAppFocused);
  const dispatch = useDispatch();

  const selectedConversationKey = useSelectedConversationKey();
  const loadedMessagesLength = useSelector(getLoadedMessagesLength);
  const mostRecentMessageId = useSelector(getMostRecentMessageId);
  const oldestMessageId = useSelector(getOldestMessageId);
  const youngestMessageId = useSelector(getYoungestMessageId);
  const fetchingMoreInProgress = useSelector(areMoreMessagesBeingFetched);
  const conversationHasUnread = useHasUnread(selectedConversationKey);
  const scrollButtonVisible = useSelector(getShowScrollButton);

  const [didScroll, setDidScroll] = useState(false);
  const quotedMessageToAnimate = useSelector(getQuotedMessageToAnimate);

  const scrollToLoadedMessage = useContext(ScrollToLoadedMessageContext);

  // if this unread-indicator is rendered,
  // we want to scroll here only if the conversation was not opened to a specific message

  useLayoutEffect(() => {
    if (
      props.messageId === youngestMessageId &&
      !quotedMessageToAnimate &&
      !scrollButtonVisible &&
      !didScroll &&
      !conversationHasUnread
    ) {
      scrollToLoadedMessage(props.messageId, 'go-to-bottom');
      setDidScroll(true);
    } else if (quotedMessageToAnimate) {
      setDidScroll(true);
    }
  });

  const onVisible = useCallback(
    // tslint:disable-next-line: cyclomatic-complexity
    async (inView: boolean | Object) => {
      if (!selectedConversationKey) {
        return;
      }
      // we are the most recent message
      if (mostRecentMessageId === messageId) {
        // make sure the app is focused, because we mark message as read here
        if (inView === true && isAppFocused) {
          dispatch(showScrollToBottomButton(false));
          getConversationController()
            .get(selectedConversationKey)
            ?.markConversationRead(receivedAt || 0); // TODOLATER this should be `sentAt || serverTimestamp` I think

          dispatch(markConversationFullyRead(selectedConversationKey));
        } else if (inView === false) {
          dispatch(showScrollToBottomButton(true));
        }
      }

      if (
        inView === true &&
        isAppFocused &&
        oldestMessageId === messageId &&
        !fetchingMoreInProgress
      ) {
        debouncedTriggerLoadMoreTop(selectedConversationKey, oldestMessageId);
      }

      if (
        inView === true &&
        isAppFocused &&
        youngestMessageId === messageId &&
        !fetchingMoreInProgress
      ) {
        debouncedTriggerLoadMoreBottom(selectedConversationKey, youngestMessageId);
      }

      // this part is just handling the marking of the message as read if needed
      if (
        (inView === true ||
          ((inView as any).type === 'focus' && (inView as any).returnValue === true)) &&
        isAppFocused
      ) {
        if (isUnread) {
          // TODOLATER this is pretty expensive and should instead use values from the redux store
          const found = await Data.getMessageById(messageId);

          if (found && Boolean(found.get('unread'))) {
            const foundSentAt = found.get('sent_at') || found.get('serverTimestamp');
            // we should stack those and send them in a single message once every 5secs or something.
            // this would be part of an redesign of the sending pipeline
            // mark the whole conversation as read until this point.
            // this will trigger the expire timer.
            if (foundSentAt) {
              getConversationController()
                .get(selectedConversationKey)
                ?.markConversationRead(foundSentAt, Date.now());
            }
          }
        }
      }
    },
    [
      selectedConversationKey,
      mostRecentMessageId,
      oldestMessageId,
      fetchingMoreInProgress,
      isAppFocused,
      loadedMessagesLength,
      receivedAt,
      messageId,
      isUnread,
    ]
  );

  return (
    // tslint:disable-next-line: use-simple-attributes
    <InView
      id={`msg-${messageId}`}
      onContextMenu={onContextMenu}
      className={className}
      as="div"
      threshold={0.5} // consider that more than 50% of the message visible means it is read
      delay={isAppFocused ? 100 : 200}
      onChange={isAppFocused ? onVisible : noop}
      triggerOnce={false}
      trackVisibility={true}
      key={`inview-msg-${messageId}`}
      // TODO We will need to update the integration tests to use that new value, or update the values given in the `dataTestId` props to match what they expect
      data-testid={dataTestId || 'readable-message'}
    >
      {props.children}
    </InView>
  );
};
