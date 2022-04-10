import { getV2OpenGroupRoomByRoomId } from '../../../../data/opengroups';
import { parseStatusCodeFromOnionRequest } from './OpenGroupAPIV2Parser';
import _ from 'lodash';
import { sendViaOnionToNonSnode } from '../../../onions/onionSend';
import { OpenGroupMessageV2 } from './OpenGroupMessageV2';
import { APPLICATION_JSON } from '../../../../types/MIME';
import { getOurOpenGroupHeaders, OpenGroupRequestHeaders } from './OpenGroupPollingUtils';

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
) => {
  window?.log?.warn({ roomInfos });

  if (!serverUrl.includes('.dev')) {
    window?.log?.warn('not a dev url -- cancelling early');
    return;
  }

  const [roomId] = roomInfos;
  const fetchedRoomInfo = await getV2OpenGroupRoomByRoomId({
    serverUrl,
    roomId,
  });
  if (!fetchedRoomInfo || !fetchedRoomInfo?.serverPublicKey) {
    window?.log?.warn('Couldnt get fetched info or server public key -- aborting batch request');
    return;
  }
  const { serverPublicKey } = fetchedRoomInfo;

  const batchRequest = await getBatchRequest(serverPublicKey, roomId, useV4);
  console.warn({ batchRequest });

  if (!batchRequest) {
    window?.log?.error('Could not generate batch request. Aborting request');
    return;
  }

  sendOpenGroupBatchRequest(serverUrl, serverPublicKey, batchRequest, abortSignal, useV4);
  // sendOpenGroupBatchRequest(serverUrl, serverPublicKey, batchRequest, abortSignal, true);
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

  let res;
  if (useV4) {
    res = await sendViaOnionToNonSnode(
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
    res = await sendViaOnionToNonSnode(
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

  console.warn({ batchRes: res });
  const status = parseStatusCodeFromOnionRequest(res);
  console.warn({ batchStatus: status });
};

export type ParsedDeletions = Array<{ id: number; deleted_message_id: number }>;

type StatusCodeType = {
  statusCode: number;
};

export type ParsedRoomCompactPollResults = StatusCodeType & {
  roomId: string;
  deletions: ParsedDeletions;
  messages: Array<OpenGroupMessageV2>;
  moderators: Array<string>;
};

export type ParsedBase64Avatar = {
  roomId: string;
  base64: string;
};

export type ParsedMemberCount = {
  roomId: string;
  memberCount: number;
};
