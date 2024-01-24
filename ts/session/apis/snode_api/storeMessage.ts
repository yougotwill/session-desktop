import { Snode } from '../../../data/data';
import {
  BatchStoreWithExtraParams,
  NotEmptyArrayOfBatchResults,
  SnodeApiSubRequests,
  StoreOnNodeSubRequest,
  SubaccountRevokeSubRequest,
  SubaccountUnrevokeSubRequest,
  isDeleteByHashesParams,
} from './SnodeRequestTypes';
import { doSnodeBatchRequest } from './batchRequest';
import { GetNetworkTime } from './getNetworkTime';

async function buildStoreRequests(
  params: Array<BatchStoreWithExtraParams>
): Promise<Array<SnodeApiSubRequests>> {
  const storeRequests = await Promise.all(
    params.map(p => {
      if (isDeleteByHashesParams(p)) {
        return {
          method: 'delete' as const,
          params: p,
        };
      }

      // those requests are already fully contained.
      if (p instanceof SubaccountRevokeSubRequest || p instanceof SubaccountUnrevokeSubRequest) {
        return p.buildAndSignParameters();
      }

      const storeRequest: StoreOnNodeSubRequest = {
        method: 'store',
        params: p,
      };

      return storeRequest;
    })
  );

  return storeRequests;
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
    const subRequests = await buildStoreRequests(params);
    const asssociatedWith = (params[0] as any)?.pubkey as string | undefined;
    if (!asssociatedWith) {
      // not ideal
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
