import { ConversationAttributes } from '../models/conversationAttributes';

export function objectToJSON(data: Record<any, any>) {
  const str = JSON.stringify(data);
  return str;
}
export function jsonToObject(json: string): Record<string, any> {
  return JSON.parse(json);
}

function jsonToArray(json: string): Array<string> {
  try {
    return JSON.parse(json);
  } catch (e) {
    window.log.warn('jsontoarray failed:', e.message);
    return [];
  }
}

export function arrayStrToJson(arr: Array<string>): string {
  return JSON.stringify(arr);
}

export function toSqliteBoolean(val: boolean): number {
  return val ? 1 : 0;
}

export function formatRowOfConversation(row?: Record<string, any>): ConversationAttributes | null {
  if (!row) {
    return null;
  }

  const convo: ConversationAttributes = row as ConversationAttributes;

  if (convo.groupAdmins?.length) {
    convo.groupAdmins = convo.groupAdmins?.length ? jsonToArray(row.groupAdmins) : [];
  }

  if (convo.members?.length) {
    convo.members = row.members?.length ? jsonToArray(row.members) : [];
  }

  if (convo.zombies?.length) {
    convo.zombies = row.zombies?.length ? jsonToArray(row.zombies) : [];
  }

  // sqlite stores boolean as integer. to clean thing up we force the expected boolean fields to be boolean
  convo.isTrustedForAttachmentDownload = Boolean(convo.isTrustedForAttachmentDownload);
  convo.isPinned = Boolean(convo.isPinned);
  convo.isApproved = Boolean(convo.isApproved);
  convo.didApproveMe = Boolean(convo.didApproveMe);
  convo.is_medium_group = Boolean(convo.is_medium_group);
  convo.mentionedUs = Boolean(convo.mentionedUs);
  convo.isKickedFromGroup = Boolean(convo.isKickedFromGroup);
  convo.left = Boolean(convo.left);

  if (!convo.lastMessage) {
    convo.lastMessage = null;
  }

  if (!convo.lastMessageStatus) {
    convo.lastMessageStatus = undefined;
  }

  if (!convo.triggerNotificationsFor) {
    convo.triggerNotificationsFor = 'all';
  }

  if (!convo.unreadCount) {
    convo.unreadCount = 0;
  }

  if (!convo.lastJoinedTimestamp) {
    convo.lastJoinedTimestamp = 0;
  }

  if (!convo.subscriberCount) {
    convo.subscriberCount = 0;
  }

  if (!convo.expireTimer) {
    convo.expireTimer = 0;
  }

  if (!convo.active_at) {
    convo.active_at = 0;
  }

  return convo;
}
