import { Snode } from '../../../data/data';
import {
  BatchStoreWithExtraParams,
  NotEmptyArrayOfBatchResults,
  SnodeApiSubRequests,
  isDeleteByHashesParams,
  isRevokeRequest,
  isUnrevokeRequest,
} from './SnodeRequestTypes';
import { doSnodeBatchRequest } from './batchRequest';
import { GetNetworkTime } from './getNetworkTime';

function buildStoreRequests(params: Array<BatchStoreWithExtraParams>): Array<SnodeApiSubRequests> {
  return params.map(p => {
    if (isDeleteByHashesParams(p)) {
      return {
        method: 'delete' as const,
        params: p,
      };
    }

    if (isRevokeRequest(p)) {
      return p;
    }

    if (isUnrevokeRequest(p)) {
      return p;
    }

    return {
      method: 'store',
      params: p,
    };
  });
}

/**
 * Send a 'store' request to the specified targetNode, using params as argument
 * @returns the Array of stored hashes if it is a success, or null
 */
async function batchStoreOnNode(
  targetNode: Snode,
  params: Array<BatchStoreWithExtraParams>,
  method: 'batch' | 'sequence'
): Promise<NotEmptyArrayOfBatchResults> {
  try {
    const subRequests = buildStoreRequests(params);
    const asssociatedWith = (params[0] as any)?.pubkey as string | undefined;
    if (!asssociatedWith) {
      // not ideal,
      throw new Error('batchStoreOnNode first subrequest pubkey needs to be set');
    }
    const result = await doSnodeBatchRequest(
      subRequests,
      targetNode,
      4000,
      asssociatedWith,
      method
    );

    if (!result || !result.length) {
      window?.log?.warn(
        `SessionSnodeAPI::requestSnodesForPubkeyWithTargetNodeRetryable - sessionRpc on ${targetNode.ip}:${targetNode.port} returned falsish value`,
        result
      );
      throw new Error('requestSnodesForPubkeyWithTargetNodeRetryable: Invalid result');
    }

    const firstResult = result[0];

    if (firstResult.code !== 200) {
      window?.log?.warn('first result status is not 200 for storeOnNode but: ', firstResult.code);
      throw new Error('storeOnNode: Invalid status code');
    }

    GetNetworkTime.handleTimestampOffsetFromNetwork('store', firstResult.body.t);

    return result;
  } catch (e) {
    window?.log?.warn('store - send error:', e, `destination ${targetNode.ip}:${targetNode.port}`);
    throw e;
  }
}

export const SnodeAPIStore = { batchStoreOnNode };
