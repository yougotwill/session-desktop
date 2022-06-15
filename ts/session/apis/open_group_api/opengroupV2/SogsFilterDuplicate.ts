import _ from 'lodash';
import { filterAlreadyFetchedOpengroupMessage } from '../../../../data/data';
import { OpenGroupMessageV2 } from './OpenGroupMessageV2';
import { OpenGroupMessageV4 } from './OpenGroupServerPoller';

export const filterDuplicatesFromDbAndIncoming = async (
  newMessages: Array<OpenGroupMessageV2>
): Promise<Array<OpenGroupMessageV2>> => {
  const start = Date.now();
  // open group messages are deduplicated by sender and serverTimestamp only.
  // first make sure that the incoming messages have no duplicates:
  const filtered = _.uniqWith(newMessages, (a, b) => {
    return (
      Boolean(a.sender) &&
      Boolean(a.sentTimestamp) &&
      a.sender === b.sender &&
      a.sentTimestamp === b.sentTimestamp
    );
    // make sure a sender is set, as we cast it just below
  }).filter(m => Boolean(m.sender));

  // now, check database to make sure those messages are not already fetched
  const filteredInDb = await filterAlreadyFetchedOpengroupMessage(
    filtered.map(m => {
      return { sender: m.sender as string, serverTimestamp: m.sentTimestamp };
    })
  );

  window.log.debug(
    `[perf] filterDuplicatesFromDbAndIncoming took ${Date.now() - start}ms for ${
      newMessages.length
    } messages`
  );
  const opengroupMessagesFiltered = filteredInDb?.map(f => {
    return newMessages.find(m => m.sender === f.sender && m.sentTimestamp === f.serverTimestamp);
  });
  return _.compact(opengroupMessagesFiltered) || [];
};

export const filterDuplicatesFromDbAndIncomingV4 = async (
  newMessages: Array<OpenGroupMessageV4>
): Promise<Array<OpenGroupMessageV4>> => {
  const start = Date.now();

  // open group messages are deduplicated by sender and serverTimestamp only.
  // first make sure that the incoming messages have no duplicates:
  const filtered = _.uniqWith(newMessages, (a, b) => {
    return (
      Boolean(a.session_id) &&
      Boolean(a.posted) &&
      a.session_id === b.session_id &&
      a.posted === b.posted
    );
    // make sure a sender is set, as we cast it just below
  }).filter(m => Boolean(m.session_id));

  // now, check database to make sure those messages are not already fetched
  const filteredInDb = await filterAlreadyFetchedOpengroupMessage(
    filtered.map(m => {
      return { sender: m.session_id as string, serverTimestamp: m.posted };
    })
  );
  // console.warn('filteredInDb', filteredInDb);

  window.log.debug(
    `[perf] filterDuplicatesFromDbAndIncomingV4 took ${Date.now() - start}ms for ${
      newMessages.length
    }:${filtered.length} messages`
  );
  const opengroupMessagesV4Filtered = filteredInDb?.map(f => {
    return newMessages.find(m => m.session_id === f.sender && m.posted === f.serverTimestamp);
  });
  return _.compact(opengroupMessagesV4Filtered) || [];
};
