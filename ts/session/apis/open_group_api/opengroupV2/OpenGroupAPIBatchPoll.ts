import { getV2OpenGroupRoomByRoomId } from '../../../../data/opengroups';
import _ from 'lodash';
import { OnionSnodeResponse, sendViaOnionToNonSnode } from '../../../onions/onionSend';
import { APPLICATION_JSON } from '../../../../types/MIME';
import {
  decodeV4Response,
  getOurOpenGroupHeaders,
  OpenGroupRequestHeaders,
  ResponseDecodedV4,
} from './OpenGroupPollingUtils';

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
  useV4: boolean = false,
  batchRequestOptions: Array<SubrequestOption>
): Promise<ResponseDecodedV4 | null> => {
  // if (!(serverUrl.includes('.dev') || serverUrl.includes(':8080'))) {
  // if (!serverUrl.includes(':8080')) {
  //   window?.log?.warn('not a dev url -- cancelling early');
  //   return null;
  // }

  // getting server pk for room
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

  // creating batch request
  const batchRequest = await getBatchRequest(serverPublicKey, useV4, batchRequestOptions);
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

export enum SubrequestOptionType {
  'capabilities',
  'messages',
  'pollInfo',
  'inbox',
}

export type SubrequestOption = {
  type: SubrequestOptionType;
  capabilities?: boolean;
  inbox?: boolean;
  messages?: {
    roomId: string;
  };
  pollInfo?: {
    roomId: string;
    infoUpdated?: number;
  };
};

/**
 *
 * @param options Array of subrequest options to be made.
 * @returns
 */
const makeBatchRequestPayload = (options: SubrequestOption): BatchSubRequest | null => {
  const GET_METHOD = 'GET';
  if (options.capabilities) {
    return {
      method: GET_METHOD,
      path: '/capabilities',
    };
  }

  if (options.messages) {
    // TODO: allow more options for path building
    return {
      method: GET_METHOD,
      // path: `/room/${options.messages.roomId}/messages/recent?limit=25`,
      path: `/room/${options.messages.roomId}/messages/recent`,
    };
  }

  if (options.inbox) {
    return {
      method: GET_METHOD,
      path: '/inbox',
    };
  }

  if (options.pollInfo) {
    return {
      method: GET_METHOD,
      path: `/room/${options.pollInfo.roomId}/pollInfo/${options.pollInfo.infoUpdated}`,
    };
  }

  return null;
};

const getBatchRequest = async (
  serverPublicKey: string,
  useV4: boolean = false,
  batchOptions: Array<SubrequestOption>
): Promise<BatchRequest | undefined> => {
  const BATCH_ENDPOINT = '/batch';
  const BATCH_METHOD = 'POST';

  // TODO: add testing
  const batchBody = batchOptions.map(options => {
    return makeBatchRequestPayload(options);
  });

  // TODO: swap out batchCommands for body fn parameter
  const headers = batchBody
    ? await getOurOpenGroupHeaders(
        serverPublicKey,
        BATCH_ENDPOINT,
        BATCH_METHOD,
        false,
        JSON.stringify(batchBody)
      )
    : await getOurOpenGroupHeaders(serverPublicKey, BATCH_ENDPOINT, BATCH_METHOD, false);

  if (!headers) {
    window?.log?.error('Unable to create headers for batch request - aborting');
    return;
  }

  if (useV4) {
    // TODO: check if batch will always be json
    headers['Content-Type'] = APPLICATION_JSON;
  }

  return {
    endpoint: BATCH_ENDPOINT,
    method: BATCH_METHOD,
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
  if (!decodedResponse) {
    window?.log?.error('Unable to decode response - dropping batch response');
    return;
  }

  return decodedResponse;
};
