import { getV2OpenGroupRoomByRoomId } from '../../../../data/opengroups';
import _, { isEmpty, isNumber, isObject } from 'lodash';
import { sendViaOnionV4ToNonSnode } from '../../../onions/onionSend';
import {
  getOurOpenGroupHeaders,
  OpenGroupRequestHeaders,
} from '../opengroupV2/OpenGroupPollingUtils';
import { addJsonContentTypeToHeaders } from './sogsV3SendMessage';
import { AbortSignal } from 'abort-controller';
import { roomHasBlindEnabled } from './sogsV3Capabilities';

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

export type BatchSogsReponse = {
  status_code: number;
  body?: Array<{ body: object; code: number; headers?: Record<string, string> }>;
};

export const sogsBatchPoll = async (
  serverUrl: string,
  roomInfos: Set<string>,
  abortSignal: AbortSignal,
  batchRequestOptions: Array<OpenGroupBatchRow>
): Promise<BatchSogsReponse | null> => {
  // getting server pk for room
  const [roomId] = roomInfos;
  const fetchedRoomInfo = getV2OpenGroupRoomByRoomId({
    serverUrl,
    roomId,
  });
  if (!fetchedRoomInfo || !fetchedRoomInfo?.serverPublicKey) {
    window?.log?.warn('Couldnt get fetched info or server public key -- aborting batch request');
    return null;
  }
  const { serverPublicKey } = fetchedRoomInfo;
  // send with blinding if we need to

  const requireBlinding = Boolean(roomHasBlindEnabled(fetchedRoomInfo));
  // creating batch request
  const batchRequest = await getBatchRequest(serverPublicKey, batchRequestOptions, requireBlinding);
  if (!batchRequest) {
    window?.log?.error('Could not generate batch request. Aborting request');
    return null;
  }

  const result = await sendSogsBatchRequest(serverUrl, serverPublicKey, batchRequest, abortSignal);
  if (abortSignal.aborted) {
    window.log.info('sendSogsBatchRequest aborted.');
    return null;
  }

  return result || null;
};

export type SubrequestOptionType = 'capabilities' | 'messages' | 'pollInfo' | 'inbox';

export type SubRequestCapabilitiesType = { type: 'capabilities' };
export type SubRequestMessagesType = {
  type: 'messages';
  messages?: {
    roomId: string;
    sinceSeqNo?: number;
  };
};
export type SubRequestPollInfoType = {
  type: 'pollInfo';
  pollInfo?: {
    roomId: string;
    infoUpdated?: number;
  };
};
export type SubRequestInboxType = {
  type: 'inbox';
  inboxSince?: {
    id?: number;
  };
};
export type SubRequestOutboxType = {
  type: 'outbox';
  outboxSince?: {
    id?: number;
  };
};

export type OpenGroupBatchRow =
  | SubRequestCapabilitiesType
  | SubRequestMessagesType
  | SubRequestPollInfoType
  | SubRequestInboxType
  | SubRequestOutboxType;

/**
 *
 * @param options Array of subrequest options to be made.
 */
const makeBatchRequestPayload = (options: OpenGroupBatchRow): BatchSubRequest | null => {
  const GET_METHOD = 'GET';
  if (options.type === 'capabilities') {
    return {
      method: GET_METHOD,
      path: '/capabilities',
    };
  }

  if (options.type === 'messages' && options.messages) {
    return {
      method: GET_METHOD,
      path: isNumber(options.messages.sinceSeqNo)
        ? `/room/${options.messages.roomId}/messages/since/${options.messages.sinceSeqNo}`
        : `/room/${options.messages.roomId}/messages/recent`,
    };
  }

  if (options.type === 'inbox') {
    return {
      method: GET_METHOD,
      path:
        options?.inboxSince?.id && isNumber(options.inboxSince.id)
          ? `/inbox/since/${options.inboxSince.id}`
          : '/inbox',
    };
  }

  if (options.type === 'outbox') {
    return {
      method: GET_METHOD,
      path:
        options?.outboxSince?.id && isNumber(options.outboxSince.id)
          ? `/outbox/since/${options.outboxSince.id}`
          : '/outbox',
    };
  }

  if (options.type === 'pollInfo' && options.pollInfo) {
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
  batchOptions: Array<OpenGroupBatchRow>,
  requireBlinding: boolean
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
    requireBlinding,
    stringBody
  );

  if (!headers) {
    window?.log?.error('Unable to create headers for batch request - aborting');
    return;
  }

  return {
    endpoint: batchEndpoint,
    method: batchMethod,
    body: stringBody,
    headers: addJsonContentTypeToHeaders(headers),
  };
};

const sendSogsBatchRequest = async (
  serverUrl: string,
  serverPubkey: string,
  request: BatchRequest,
  abortSignal: AbortSignal
): Promise<null | any> => {
  const { endpoint, headers, method, body } = request;
  const builtUrl = new URL(`${serverUrl}/${endpoint}`);
  // console.warn(
  //   `sendSogsBatchRequest including ${
  //     headers['X-SOGS-Pubkey']?.startsWith('15') ? 'blinded' : 'unblinded'
  //   } headers`
  // );

  // this function extracts the body and status_code and JSON.parse it already
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

  if (abortSignal.aborted) {
    return null;
  }

  if (!batchResponse) {
    window?.log?.error('sogsbatch: Undefined batch response - cancelling batch request');
    return;
  }
  if (isObject(batchResponse.body)) {
    return batchResponse;
  }
  window?.log?.warn('sogsbatch: batch response decoded body is not object. Reutrning null');

  return null;
};
