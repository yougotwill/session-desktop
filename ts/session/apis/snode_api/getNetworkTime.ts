/**
 * Makes a post to a node to receive the timestamp info. If non-existent, returns -1
 * @param snode Snode to send request to
 * @returns timestamp of the response from snode
 */

import { isNumber } from 'lodash';

import { BatchRequests } from './batchRequest';
import { Snode } from '../../../data/types';
import { NetworkTimeSubRequest } from './SnodeRequestTypes';
import { NetworkTime } from '../../../util/NetworkTime';

const getNetworkTime = async (snode: Snode): Promise<string | number> => {
  const subRequest = new NetworkTimeSubRequest();

  const result = await BatchRequests.doUnsignedSnodeBatchRequestNoRetries(
    [subRequest],
    snode,
    10000,
    null,
    false
  );
  if (!result || !result.length) {
    window?.log?.warn(`getNetworkTime on ${snode.ip}:${snode.port} returned falsy value`, result);
    throw new Error('getNetworkTime: Invalid result');
  }

  const firstResult = result[0];

  if (firstResult.code !== 200) {
    window?.log?.warn('Status is not 200 for getNetworkTime but: ', firstResult.code);
    throw new Error('getNetworkTime: Invalid status code');
  }

  const timestamp = firstResult?.body?.timestamp;
  if (!timestamp) {
    throw new Error(`getNetworkTime returned invalid timestamp: ${timestamp}`);
  }
  GetNetworkTime.handleTimestampOffsetFromNetwork('getNetworkTime', timestamp);
  return timestamp;
};

function handleTimestampOffsetFromNetwork(_request: string, snodeTimestamp: number) {
  if (snodeTimestamp && isNumber(snodeTimestamp) && snodeTimestamp > 1609419600 * 1000) {
    // first january 2021. Arbitrary, just want to make sure the return timestamp is somehow valid and not some crazy low value
    const clockTime = Date.now();
    NetworkTime.setLatestTimestampOffset(clockTime - snodeTimestamp);
  }
}

export const GetNetworkTime = {
  getNetworkTime,
  handleTimestampOffsetFromNetwork,
};
