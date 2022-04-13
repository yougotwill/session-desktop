import { getV2OpenGroupRoomByRoomId } from '../../../../data/opengroups';
import { parseStatusCodeFromOnionRequest } from './OpenGroupAPIV2Parser';
import _ from 'lodash';
import { OnionSnodeResponse, sendViaOnionToNonSnode } from '../../../onions/onionSend';
import { OpenGroupMessageV2 } from './OpenGroupMessageV2';
import { APPLICATION_JSON } from '../../../../types/MIME';
import {
  decodeV4Response,
  getOurOpenGroupHeaders,
  OpenGroupRequestHeaders,
  ResponseDecodedV4,
} from './OpenGroupPollingUtils';
import { SnodeResponse } from '../../snode_api/onions';

type BatchFetchRequestOptions = {
  method: 'GET';
  path: string;
  headers?: any;
};

/**
 * Should only have this or the json field but not both at the same time
 */
type BatchBodyRequestSharedOptions = {
  method: 'POST' | 'PUT';
  path: string;
  headers?: any;
};

interface BatchJsonSubrequestOptions extends BatchBodyRequestSharedOptions {
  json: string;
}

interface Batch64SubrequestOptions extends BatchBodyRequestSharedOptions {
  b64: string;
}

type BatchBodyRequest = BatchJsonSubrequestOptions | Batch64SubrequestOptions;

type BatchSubRequest = BatchBodyRequest | BatchFetchRequestOptions;

type BatchRequest = {
  /** Used by server to processing request */
  endpoint: string;
  /** Used by server to processing request */
  method: string;
  /** Used by server to processing request */
  body: string;
  /** Used by server to processing request and authenication */
  headers: OpenGroupRequestHeaders;
};

export const batchPoll = async (
  serverUrl: string,
  roomInfos: Set<string>,
  abortSignal: AbortSignal,
  useV4: boolean = false
): Promise<ResponseDecodedV4 | null> => {
  // if (!serverUrl.includes('.dev')) {
  // if (!(serverUrl.includes('.dev') || serverUrl.includes(':8080'))) {
  if (!serverUrl.includes(':8080')) {
    window?.log?.warn('not a dev url -- cancelling early');
    return null;
  }

  const [roomId] = roomInfos;
  const fetchedRoomInfo = await getV2OpenGroupRoomByRoomId({
    serverUrl,
    roomId,
  });
  if (!fetchedRoomInfo || !fetchedRoomInfo?.serverPublicKey) {
    window?.log?.warn('Couldnt get fetched info or server public key -- aborting batch request');
    return null;
  }
  const { serverPublicKey } = fetchedRoomInfo;

  const batchRequest = await getBatchRequest(serverPublicKey, roomId, useV4);
  console.warn({ batchRequest });

  if (!batchRequest) {
    window?.log?.error('Could not generate batch request. Aborting request');
    return null;
  }

  const result = await sendOpenGroupBatchRequest(
    serverUrl,
    serverPublicKey,
    batchRequest,
    abortSignal,
    useV4
  );
  return result ? result : null;
};

const getBatchRequest = async (
  serverPublicKey: string,
  roomId: string,
  useV4: boolean = false
): Promise<BatchRequest | undefined> => {
  const endpoint = '/batch';
  const method = 'POST';

  // TODO: hardcoding batch request for capabilities and messages for now.
  // TODO: add testing
  const batchBody: Array<BatchSubRequest> = [
    {
      // gets the last 100 messages for the room
      method: 'GET',
      path: '/capabilities',
    },
    {
      method: 'GET',
      path: `/room/${roomId}/messages/recent?limit=25`,
    },
  ];

  // TODO: swap out batchCommands for body fn parameter
  // TODO: confirm that the X-SOGS Pubkey is lowercase k or not.
  const headers = batchBody
    ? await getOurOpenGroupHeaders(
        serverPublicKey,
        endpoint,
        method,
        false,
        JSON.stringify(batchBody)
      )
    : await getOurOpenGroupHeaders(serverPublicKey, endpoint, method, false);

  if (!headers) {
    window?.log?.error('Unable to create headers for batch request - aborting');
    return;
  }

  if (useV4) {
    // TODO: check if batch will always be json
    headers['Content-Type'] = APPLICATION_JSON;
  }

  return {
    endpoint: '/batch',
    method: 'POST',
    body: JSON.stringify(batchBody),
    headers,
  };
};

const sendOpenGroupBatchRequest = async (
  serverUrl: string,
  serverPubkey: string,
  request: BatchRequest,
  abortSignal: AbortSignal,
  useV4: boolean = false
): Promise<any> => {
  const { endpoint, headers, method, body } = request;
  const builtUrl = new URL(`${serverUrl}/${endpoint}`);

  let batchResponse: OnionSnodeResponse | null;
  if (useV4) {
    batchResponse = await sendViaOnionToNonSnode(
      serverPubkey,
      builtUrl,
      {
        method,
        headers,
        body,
      },
      {},
      abortSignal,
      true
    );
  } else {
    batchResponse = await sendViaOnionToNonSnode(
      serverPubkey,
      builtUrl,
      {
        method,
        headers,
        body,
      },
      {},
      abortSignal
    );
  }

  if (!batchResponse) {
    window?.log?.error('Undefined batch response - cancelling batch request');
    return;
  }

  const decodedResponse = decodeV4Response(batchResponse.result.body);
  console.warn({ decodedData: decodedResponse });
  if (!decodedResponse) {
    window?.log?.error('Unable to decode response - dropping batch response');
    return;
  }

  return decodedResponse;
};
