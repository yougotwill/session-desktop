import { defaults } from 'lodash';
import { LastMessageStatusType } from '../state/ducks/conversations';

export enum ConversationTypeEnum {
  GROUP = 'group',
  PRIVATE = 'private',
}

/**
 * all: all  notifications enabled, the default
 * disabled: no notifications at all
 * mentions_only: trigger a notification only on mentions of ourself
 */
export const ConversationNotificationSetting = ['all', 'disabled', 'mentions_only'] as const;
export type ConversationNotificationSettingType = typeof ConversationNotificationSetting[number];

export interface ConversationAttributes {
  id: string;
  type: string;

  active_at: number;

  profileName?: string; // this is the name the user/closed group/ opengroup has set
  nickname?: string; // this is the nane WE gave to that user
  name?: string; // for open and closed groups, this is currently the name of it (for now) // FIXME Audric

  profile?: any;
  profileKey?: string; // Consider this being a hex string if it set

  members: Array<string>; // members are all members for this group. zombies excluded
  zombies: Array<string>; // only used for closed groups. Zombies are users which left but not yet removed by the admin
  left: boolean;
  expireTimer: number;
  mentionedUs: boolean;
  unreadCount: number;
  lastMessageStatus: LastMessageStatusType;
  lastMessage: string | null;
  lastJoinedTimestamp: number; // ClosedGroup: last time we were added to this group
  groupAdmins: Array<string>;
  isKickedFromGroup: boolean;
  subscriberCount: number;

  is_medium_group: boolean;

  avatarPointer?: string; // this is the url of the avatar on the file server v2
  avatar?: string | { path?: string }; // this is the avatar path locally once downloaded and stored in the application attachments folder
  avatarHash?: string; //Avatar hash is currently used for opengroupv2. it's sha256 hash of the base64 avatar data.

  triggerNotificationsFor: ConversationNotificationSettingType;
  isTrustedForAttachmentDownload: boolean;
  isPinned: boolean;
  isApproved: boolean;
  didApproveMe: boolean;
}

/**
 * This function mutates optAttributes
 * @param optAttributes the entry object attributes to set the defaults to.
 */
export const fillConvoAttributesWithDefaults = (
  optAttributes: ConversationAttributes
): ConversationAttributes => {
  return defaults(optAttributes, {
    members: [],
    zombies: [],
    groupAdmins: [],

    unreadCount: 0,
    lastJoinedTimestamp: 0,
    subscriberCount: 0,
    expireTimer: 0,
    active_at: 0,

    lastMessageStatus: undefined,
    lastMessage: null,

    triggerNotificationsFor: 'all', // if the settings is not set in the db, this is the default

    isTrustedForAttachmentDownload: false, // we don't trust a contact until we say so
    isPinned: false,
    isApproved: false,
    didApproveMe: false,
    is_medium_group: false,
    mentionedUs: false,
    isKickedFromGroup: false,
    left: false,
  });
};
