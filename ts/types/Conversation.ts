import { LastMessageStatusType } from '../state/ducks/conversations';
import { Message } from './Message';

interface ConversationLastMessageUpdate {
  lastMessage: string;
  lastMessageStatus: LastMessageStatusType;
}

export const createLastMessageUpdate = ({
  lastMessage,
  lastMessageStatus,
  lastMessageNotificationText,
}: {
  lastMessage?: Message;
  lastMessageStatus?: LastMessageStatusType;
  lastMessageNotificationText?: string;
}): ConversationLastMessageUpdate => {
  if (!lastMessage) {
    return {
      lastMessage: '',
      lastMessageStatus: undefined,
    };
  }

  return {
    lastMessage: lastMessageNotificationText || '',
    lastMessageStatus: lastMessageStatus || undefined,
  };
};
