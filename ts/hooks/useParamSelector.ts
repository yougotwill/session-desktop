import { isEmpty, isNumber } from 'lodash';
import { useSelector } from 'react-redux';
import {
  hasValidIncomingRequestValues,
  hasValidOutgoingRequestValues,
} from '../models/conversation';
import { PubKey } from '../session/types';
import { UserUtils } from '../session/utils';
import { StateType } from '../state/reducer';
import { getMessageReactsProps } from '../state/selectors/conversations';
import { isPrivateAndFriend } from '../state/selectors/selectedConversation';
import { CONVERSATION } from '../session/constants';
import {
  ConversationInteractionStatus,
  ConversationInteractionType,
} from '../interactions/conversationInteractions';

export function useAvatarPath(convoId: string | undefined) {
  const convoProps = useConversationPropsById(convoId);
  return convoProps?.avatarPath || null;
}

export function useOurAvatarPath() {
  return useAvatarPath(UserUtils.getOurPubKeyStrFromCache());
}

/**
 *
 * @returns convo.nickname || convo.displayNameInProfile || convo.id or undefined if the convo is not found
 */
export function useConversationUsername(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);

  return convoProps?.nickname || convoProps?.displayNameInProfile || convoId;
}

/**
 * Returns either the nickname, displayNameInProfile, or the shorten pubkey
 */
export function useConversationUsernameOrShorten(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);

  return (
    convoProps?.nickname || convoProps?.displayNameInProfile || (convoId && PubKey.shorten(convoId))
  );
}

/**
 * Returns the name if that conversation.
 * This is the group name, or the realName of a user for a private conversation with a recent nickname set
 */
export function useConversationRealName(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return convoProps?.isPrivate ? convoProps?.displayNameInProfile : undefined;
}

/**
 * Returns either the nickname, the profileName, in '"' or the full pubkeys given
 */
export function useConversationsUsernameWithQuoteOrFullPubkey(pubkeys: Array<string>) {
  return useSelector((state: StateType) => {
    return pubkeys.map(pubkey => {
      if (pubkey === UserUtils.getOurPubKeyStrFromCache() || pubkey.toLowerCase() === 'you') {
        return window.i18n('you');
      }
      const convo = state.conversations.conversationLookup[pubkey];
      const nameGot = convo?.displayNameInProfile;
      return nameGot?.length ? `"${nameGot}"` : pubkey;
    });
  });
}

export function useOurConversationUsername() {
  return useConversationUsername(UserUtils.getOurPubKeyStrFromCache());
}

export function useIsMe(pubkey?: string) {
  return Boolean(pubkey && pubkey === UserUtils.getOurPubKeyStrFromCache());
}

export function useIsClosedGroup(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return (convoProps && !convoProps.isPrivate && !convoProps.isPublic) || false;
}

export function useIsPrivate(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return Boolean(convoProps && convoProps.isPrivate);
}

export function useIsPrivateAndFriend(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  if (!convoProps) {
    return false;
  }
  return isPrivateAndFriend({
    approvedMe: convoProps.didApproveMe || false,
    isApproved: convoProps.isApproved || false,
    isPrivate: convoProps.isPrivate || false,
  });
}

export function useIsBlinded(convoId?: string) {
  if (!convoId) {
    return false;
  }
  return Boolean(PubKey.hasBlindedPrefix(convoId));
}

export function useHasNickname(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return Boolean(convoProps && !isEmpty(convoProps.nickname));
}

export function useNotificationSetting(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return convoProps?.currentNotificationSetting || 'all';
}
export function useIsPublic(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return Boolean(convoProps && convoProps.isPublic);
}

export function useIsBlocked(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return Boolean(convoProps && convoProps.isBlocked);
}

export function useActiveAt(convoId?: string): number | undefined {
  const convoProps = useConversationPropsById(convoId);
  return convoProps?.activeAt;
}

export function useIsActive(convoId?: string) {
  return !!useActiveAt(convoId);
}

export function useIsLeft(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return Boolean(convoProps && convoProps.left);
}

export function useIsKickedFromGroup(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return Boolean(convoProps && convoProps.isKickedFromGroup);
}

export function useWeAreAdmin(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return Boolean(convoProps && convoProps.weAreAdmin);
}

export function useWeAreModerator(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return Boolean(convoProps && (convoProps.weAreAdmin || convoProps.weAreModerator));
}

export function useExpireTimer(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return convoProps && convoProps.expireTimer;
}

export function useIsPinned(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return Boolean(
    convoProps &&
      isNumber(convoProps.priority) &&
      isFinite(convoProps.priority) &&
      convoProps.priority > 0
  );
}

export function useIsApproved(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  return Boolean(convoProps && convoProps.isApproved);
}

export function useIsIncomingRequest(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  if (!convoProps) {
    return false;
  }
  return Boolean(
    convoProps &&
      hasValidIncomingRequestValues({
        isMe: convoProps.isMe || false,
        isApproved: convoProps.isApproved || false,
        isPrivate: convoProps.isPrivate || false,
        isBlocked: convoProps.isBlocked || false,
        didApproveMe: convoProps.didApproveMe || false,
        activeAt: convoProps.activeAt || 0,
      })
  );
}

export function useIsOutgoingRequest(convoId?: string) {
  const convoProps = useConversationPropsById(convoId);
  if (!convoProps) {
    return false;
  }
  return Boolean(
    convoProps &&
      hasValidOutgoingRequestValues({
        isMe: convoProps.isMe || false,
        isApproved: convoProps.isApproved || false,
        didApproveMe: convoProps.didApproveMe || false,
        isPrivate: convoProps.isPrivate || false,
        isBlocked: convoProps.isBlocked || false,
        activeAt: convoProps.activeAt || 0,
      })
  );
}

export function useConversationPropsById(convoId?: string) {
  return useSelector((state: StateType) => {
    if (!convoId) {
      return null;
    }
    const convo = state.conversations.conversationLookup[convoId];
    if (!convo) {
      return null;
    }
    return convo;
  });
}

export function useMessageReactsPropsById(messageId?: string) {
  return useSelector((state: StateType) => {
    if (!messageId) {
      return null;
    }
    const messageReactsProps = getMessageReactsProps(state, messageId);
    if (!messageReactsProps) {
      return null;
    }
    return messageReactsProps;
  });
}

/**
 * Returns the unread count of that conversation, or 0 if none are found.
 * Note: returned value is capped at a max of CONVERSATION.MAX_UNREAD_COUNT
 */
export function useUnreadCount(conversationId?: string): number {
  const convoProps = useConversationPropsById(conversationId);
  const convoUnreadCount = convoProps?.unreadCount || 0;
  return Math.min(CONVERSATION.MAX_UNREAD_COUNT, convoUnreadCount);
}

export function useHasUnread(conversationId?: string): boolean {
  return useUnreadCount(conversationId) > 0;
}

export function useIsForcedUnreadWithoutUnreadMsg(conversationId?: string): boolean {
  const convoProps = useConversationPropsById(conversationId);
  return convoProps?.isMarkedUnread || false;
}

function useMentionedUsUnread(conversationId?: string) {
  const convoProps = useConversationPropsById(conversationId);
  return convoProps?.mentionedUs || false;
}

export function useMentionedUs(conversationId?: string): boolean {
  const hasMentionedUs = useMentionedUsUnread(conversationId);
  const hasUnread = useHasUnread(conversationId);

  return hasMentionedUs && hasUnread;
}

export function useIsTyping(conversationId?: string): boolean {
  return useConversationPropsById(conversationId)?.isTyping || false;
}

export function useConversationInteractionState(
  conversationId?: string
): {
  conversationId?: string;
  interactionStatus?: ConversationInteractionStatus;
  interactionType?: ConversationInteractionType;
} | null {
  if (!conversationId) {
    return null;
  }

  const convoProps = useConversationPropsById(conversationId);
  if (!convoProps) {
    return null;
  }

  const interactionType = convoProps.interactionType;
  const interactionStatus = convoProps.interactionStatus;

  window.log.debug(
    `WIP: useConversationInteractionState: ${conversationId} ${interactionType} ${interactionStatus}`
  );

  return { conversationId, interactionType, interactionStatus };
}
