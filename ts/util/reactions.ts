import _ from 'lodash';
import { getMessageById, getMessagesBySentAt } from '../data/data';
import { MessageModel } from '../models/message';
import { SignalService } from '../protobuf';

import { ReactionList } from '../types/Message';
import { RecentReactions } from '../types/Util';
import { getRecentReactions, saveRecentReations } from '../util/storage';

import { UserUtils } from '../session/utils';

export const sendMessageReaction = async (messageId: string, emoji: string) => {
  const found = await getMessageById(messageId);
  if (found && found.get('sent_at')) {
    const conversationModel = found?.getConversation();
    if (!conversationModel) {
      window.log.warn(`Conversation for ${messageId} not found in db`);
      return;
    }

    const author = UserUtils.getOurPubKeyStrFromCache();
    let action = 0;

    const reacts = found.get('reacts');
    if (
      reacts &&
      Object.keys(reacts).includes(emoji) &&
      Object.keys(reacts[emoji]).includes(author)
    ) {
      window.log.info('found matching reaction removing it');
      action = 1;
    } else {
      const reactions = await getRecentReactions();
      if (reactions) {
        await updateRecentReactions(reactions, emoji);
      }
    }

    await conversationModel.sendReaction(messageId, {
      id: Number(found.get('sent_at')),
      author,
      emoji,
      action,
    });

    window.log.info(
      author,
      `${action === 0 ? 'added' : 'removed'} a`,
      emoji,
      'reaction at',
      found.get('sent_at')
    );
  } else {
    window.log.warn(`Message ${messageId} not found in db`);
  }
};

/**
 * Handle reactions on the client by updating the state of the source message
 */
export const handleMessageReaction = async (
  reaction: SignalService.DataMessage.IReaction,
  messageId?: string
) => {
  const originalMessageTimestamp = Number(reaction.id);

  if (!reaction.emoji) {
    window?.log?.warn(`There is no emoji for the reaction ${messageId}.`);
    return;
  }

  const collection = await getMessagesBySentAt(originalMessageTimestamp);
  const originalMessage = collection.find((item: MessageModel) => {
    const messageTimestamp = item.get('sent_at');
    return Boolean(messageTimestamp && messageTimestamp === originalMessageTimestamp);
  });

  if (!originalMessage) {
    window?.log?.warn(`We did not find the original reacted message ${originalMessageTimestamp}.`);
    return;
  }

  const reacts: ReactionList = originalMessage.get('reacts') ?? {};
  reacts[reaction.emoji] = reacts[reaction.emoji] || {};
  const details = reacts[reaction.emoji] ?? {};
  const senders = Object.keys(details);

  switch (reaction.action) {
    // Add reaction
    case 0:
      if (senders.includes(reaction.author) && details[reaction.author] !== '') {
        window?.log?.info(
          'Received duplicate message reaction. Dropping it. id:',
          details[reaction.author]
        );
        return;
      }
      details[reaction.author] = messageId ?? '';
      break;
    // Remove reaction
    case 1:
    default:
      if (senders.length > 0) {
        if (senders.indexOf(reaction.author) >= 0) {
          // tslint:disable-next-line: no-dynamic-delete
          delete details[reaction.author];
        }
      }
  }

  if (Object.keys(details).length > 0) {
    reacts[reaction.emoji] = details;
  } else {
    // tslint:disable-next-line: no-dynamic-delete
    delete reacts[reaction.emoji];
  }

  originalMessage.set({
    reacts: !_.isEmpty(reacts) ? reacts : undefined,
  });

  await originalMessage.commit();
};

export const updateRecentReactions = async (reactions: Array<string>, newReaction: string) => {
  window?.log?.info('updating recent reactions with', newReaction);
  const recentReactions = new RecentReactions(reactions);
  const foundIndex = recentReactions.items.indexOf(newReaction);
  if (foundIndex >= 0) {
    if (foundIndex === 0) {
      return;
    }
    recentReactions.swap(foundIndex);
  } else {
    recentReactions.push(newReaction);
  }
  await saveRecentReations(recentReactions.items);
};