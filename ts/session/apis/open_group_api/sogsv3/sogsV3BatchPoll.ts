import { getV2OpenGroupRoomByRoomId } from '../../../../data/opengroups';
import _, { isEmpty } from 'lodash';
import { sendViaOnionV4ToNonSnode } from '../../../onions/onionSend';
import { APPLICATION_JSON } from '../../../../types/MIME';
import {
  getOurOpenGroupHeaders,
  OpenGroupRequestHeaders,
} from '../opengroupV2/OpenGroupPollingUtils';
import { decodeV4Response, ResponseDecodedV4 } from '../../../onions/onionv4';

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
  batchRequestOptions: Array<OpenGroupBatchRow>
): Promise<ResponseDecodedV4 | null> => {
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
  const batchRequest = await getBatchRequest(serverPublicKey, batchRequestOptions);
  console.warn('batch request: ', batchRequest);
  if (!batchRequest) {
    window?.log?.error('Could not generate batch request. Aborting request');
    return null;
  }

  const result = await sendSogsBatchRequest(serverUrl, serverPublicKey, batchRequest, abortSignal);
  return result ? result : null;
};

export enum SubrequestOptionType {
  'capabilities',
  'messages',
  'pollInfo',
  'inbox',
}

export type OpenGroupBatchRow = {
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
 */
const makeBatchRequestPayload = (options: OpenGroupBatchRow): BatchSubRequest | null => {
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

/**
 * Get the request to get all of the details we care from an opengroup, accross all rooms.
 * Only compatible with v4 onion requests.
 */
const getBatchRequest = async (
  serverPublicKey: string,
  batchOptions: Array<OpenGroupBatchRow>
): Promise<BatchRequest | undefined> => {
  const batchEndpoint = '/batch';
  const batchMethod = 'POST';
  if (!batchOptions || isEmpty(batchOptions)) {
    return undefined;
  }

  const batchBody = batchOptions.map(options => {
    return makeBatchRequestPayload(options);
  });

  const stringBody = JSON.stringify(batchBody);

  // TODO: swap out batchCommands for body fn parameter
  const headers = await getOurOpenGroupHeaders(
    serverPublicKey,
    batchEndpoint,
    batchMethod,
    true,
    stringBody
  );

  if (!headers) {
    window?.log?.error('Unable to create headers for batch request - aborting');
    return;
  }

  headers['Content-Type'] = APPLICATION_JSON;

  return {
    endpoint: batchEndpoint,
    method: batchMethod,
    body: stringBody,
    headers,
  };
};

const sendSogsBatchRequest = async (
  serverUrl: string,
  serverPubkey: string,
  request: BatchRequest,
  abortSignal: AbortSignal
): Promise<any> => {
  const { endpoint, headers, method, body } = request;
  const builtUrl = new URL(`${serverUrl}/${endpoint}`);
  const batchResponse = await sendViaOnionV4ToNonSnode(
    serverPubkey,
    builtUrl,
    {
      method,
      headers,
      body,
      useV4: true,
    },
    {},
    abortSignal
  );

  if (!batchResponse) {
    window?.log?.error('Undefined batch response - cancelling batch request');
    return;
  }
  debugger;

  const decodedResponse = decodeV4Response(batchResponse.result.body);
  if (!decodedResponse) {
    window?.log?.error('Unable to decode response - dropping batch response');
    return;
  }

  return decodedResponse;
};
