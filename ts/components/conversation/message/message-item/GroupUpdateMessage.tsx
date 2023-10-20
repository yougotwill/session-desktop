import React from 'react';

import { PubkeyType } from 'libsession_util_nodejs';
import { useConversationsUsernameWithQuoteOrFullPubkey } from '../../../../hooks/useParamSelector';
import { arrayContainsUsOnly } from '../../../../models/message';
import { PreConditionFailed } from '../../../../session/utils/errors';
import {
  PropsForGroupUpdate,
  PropsForGroupUpdateType,
} from '../../../../state/ducks/conversations';
import { useSelectedIsGroupV2 } from '../../../../state/selectors/selectedConversation';
import { useOurPkStr } from '../../../../state/selectors/user';
import { assertUnreachable } from '../../../../types/sqlSharedTypes';
import { ReadableMessage } from './ReadableMessage';
import { NotificationBubble } from './notification-bubble/NotificationBubble';

type IdWithName = { sessionId: PubkeyType; name: string };

function mapIdsWithNames(changed: Array<PubkeyType>, names: Array<string>): Array<IdWithName> {
  if (!changed.length || !names.length) {
    throw new PreConditionFailed('mapIdsWithNames needs a change');
  }
  if (changed.length !== names.length) {
    throw new PreConditionFailed('mapIdsWithNames needs a the same length to map them together');
  }
  return changed.map((sessionId, index) => {
    return { sessionId, name: names[index] };
  });
}

/**
 * When we are part of a change, we display the You first, and then others.
 * This function is used to check if we are part of the list.
 *  - if yes: returns {weArePart: true, others: changedWithoutUs}
 *  - if yes: returns {weArePart: false, others: changed}
 */
function moveUsToStart(
  changed: Array<IdWithName>,
  us: PubkeyType
): {
  sortedWithUsFirst: Array<IdWithName>;
} {
  const usAt = changed.findIndex(m => m.sessionId === us);
  if (usAt <= -1) {
    // we are not in it
    return { sortedWithUsFirst: changed };
  }
  const usItem = changed.at(usAt);
  if (!usItem) {
    throw new PreConditionFailed('"we" should have been there');
  }
  return { sortedWithUsFirst: [usItem, ...changed.slice(usAt, 1)] };
}

function changeOfMembersV2({
  changedWithNames,
  type,
  us,
}: {
  type: 'added' | 'promoted' | 'removed';
  changedWithNames: Array<IdWithName>;
  us: PubkeyType;
}): string {
  const { sortedWithUsFirst } = moveUsToStart(changedWithNames, us);
  if (changedWithNames.length === 0) {
    throw new PreConditionFailed('change must always have an associated change');
  }
  const subject =
    sortedWithUsFirst.length === 1 && sortedWithUsFirst[0].sessionId === us
      ? 'You'
      : sortedWithUsFirst.length === 1
      ? 'One'
      : sortedWithUsFirst.length === 2
      ? 'Two'
      : 'Others';

  const action =
    type === 'added' ? 'Joined' : type === 'promoted' ? 'Promoted' : ('Removed' as const);
  const key = `group${subject}${action}` as const;

  return window.i18n(
    key,
    sortedWithUsFirst.map(m => m.name)
  );
}

// TODO those lookups might need to be memoized
const ChangeItemJoined = (added: Array<PubkeyType>): string => {
  if (!added.length) {
    throw new Error('Group update add is missing contacts');
  }
  const names = useConversationsUsernameWithQuoteOrFullPubkey(added);
  const isGroupV2 = useSelectedIsGroupV2();
  const us = useOurPkStr();
  if (isGroupV2) {
    return changeOfMembersV2({
      changedWithNames: mapIdsWithNames(added, names),
      type: 'added',
      us,
    });
  }
  const joinKey = added.length > 1 ? 'multipleJoinedTheGroup' : 'joinedTheGroup';
  return window.i18n(joinKey, [names.join(', ')]);
};

const ChangeItemKicked = (removed: Array<PubkeyType>): string => {
  if (!removed.length) {
    throw new Error('Group update removed is missing contacts');
  }
  const names = useConversationsUsernameWithQuoteOrFullPubkey(removed);
  const isGroupV2 = useSelectedIsGroupV2();
  const us = useOurPkStr();
  if (isGroupV2) {
    return changeOfMembersV2({
      changedWithNames: mapIdsWithNames(removed, names),
      type: 'removed',
      us,
    });
  }

  if (arrayContainsUsOnly(removed)) {
    return window.i18n('youGotKickedFromGroup');
  }

  const kickedKey = removed.length > 1 ? 'multipleKickedFromTheGroup' : 'kickedFromTheGroup';
  return window.i18n(kickedKey, [names.join(', ')]);
};

const ChangeItemPromoted = (promoted: Array<PubkeyType>): string => {
  if (!promoted.length) {
    throw new Error('Group update promoted is missing contacts');
  }
  const names = useConversationsUsernameWithQuoteOrFullPubkey(promoted);
  const isGroupV2 = useSelectedIsGroupV2();
  const us = useOurPkStr();
  if (isGroupV2) {
    return changeOfMembersV2({
      changedWithNames: mapIdsWithNames(promoted, names),
      type: 'promoted',
      us,
    });
  }
  throw new PreConditionFailed('ChangeItemPromoted only applies to groupv2');
};

const ChangeItemLeft = (left: Array<PubkeyType>): string => {
  if (!left.length) {
    throw new Error('Group update remove is missing contacts');
  }

  const names = useConversationsUsernameWithQuoteOrFullPubkey(left);

  if (arrayContainsUsOnly(left)) {
    return window.i18n('youLeftTheGroup');
  }

  const leftKey = left.length > 1 ? 'multipleLeftTheGroup' : 'leftTheGroup';
  return window.i18n(leftKey, [names.join(', ')]);
};

const ChangeItemName = (newName: string) => {
  const isGroupV2 = useSelectedIsGroupV2();
  if (isGroupV2) {
    return newName
      ? window.i18n('groupNameChange', [newName])
      : window.i18n('groupNameChangeFallback');
  }
  return window.i18n('titleIsNow', [newName || '']);
};

const ChangeItem = (change: PropsForGroupUpdateType): string => {
  const { type } = change;
  switch (type) {
    case 'name':
      return ChangeItemName(change.newName);
    case 'add':
      return ChangeItemJoined(change.added);

    case 'left':
      return ChangeItemLeft(change.left);

    case 'kicked':
      return ChangeItemKicked(change.kicked);
    case 'promoted':
      return ChangeItemPromoted(change.promoted);
    default:
      assertUnreachable(type, `ChangeItem: Missing case error "${type}"`);
      return '';
  }
};

export const GroupUpdateMessage = (props: PropsForGroupUpdate) => {
  const { change, messageId, receivedAt, isUnread } = props;

  return (
    <ReadableMessage
      messageId={messageId}
      receivedAt={receivedAt}
      isUnread={isUnread}
      key={`readable-message-${messageId}`}
    >
      <NotificationBubble notificationText={ChangeItem(change)} iconType="users" />
    </ReadableMessage>
  );
};
