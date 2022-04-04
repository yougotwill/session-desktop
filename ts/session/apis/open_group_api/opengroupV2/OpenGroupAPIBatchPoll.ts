import { getV2OpenGroupRoomByRoomId, OpenGroupV2Room } from '../../../../data/opengroups';
import { OpenGroupCapabilityRequest } from './ApiUtil';
import { parseStatusCodeFromOnionRequest } from './OpenGroupAPIV2Parser';
import _ from 'lodash';
import { sendViaOnionToNonSnode } from '../../../onions/onionSend';
import { OpenGroupMessageV2 } from './OpenGroupMessageV2';
import { getAuthToken } from './ApiAuth';
import { UserUtils } from '../../../utils';
import { fromHexToArray } from '../../../utils/String';
import { getSodium } from '../../../crypto';
import { getOpenGroupHeaders } from './OpenGroupAuthentication';

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
  headers: {
    'X-SOGS-Pubkey': string;
    'X-SOGS-Timestamp': string | number;
    'X-SOGS-Signature': string;
    'X-SOGS-Nonce': string;
  };
};

export const encodeV4Request = (req: string, body?: string): string => {
  // TODO: take it the request object and body and stringify in here rather than take string params.
  // explicitly set the header to contain the data type being used
  const encodeText = (s: string) => {
    return `${s.length}:${s}`;
  };

  // N:data - a binary str, where N is number of ascii digits. e.g. 11:hello world enceds the 11 byte string hello world.
  // @@: double check that this is that same as converting to char codes.
  const metaEncoded = encodeText(req);

  let bodyEncoded = '';
  if (body) {
    bodyEncoded = encodeText(body);
  }

  const bencoded = `l${metaEncoded}${bodyEncoded}e`;
  return bencoded;
};

/**
 * Nearly identical to request encoding. 2 string bencoded list.
 * Response differs in that the second body part is always present in a response unlike the requests.
 * 1. First part contains response metadata
 * 2. Second part contains the request body.
 */
export const decodeV4Response = (response: string) => {
  // json part will have code: containing response code and headers for http headers (always lower case)
  // 1. read first bit till colon to get the length. Substring the next X amount trailing the colon and that's the metadata.
  // 2. grab the number before the next colon. That's the expected length of the body.
  // 3. Use the content type from the metadata header to handle the body.
  const firstDelimitIdx = response.indexOf(':');
  const metaLength = parseInt(response.slice(1, firstDelimitIdx));

  const metaStartIdx = firstDelimitIdx + 1;
  const metaEndIdx = metaStartIdx + metaLength;
  const meta = JSON.parse(response.slice(metaStartIdx, metaEndIdx));

  const finalIdxBeforeBody = response.indexOf(':', metaEndIdx);
  const bodyLength = parseInt(response.slice(metaEndIdx, finalIdxBeforeBody));

  const bodyData = response.slice(finalIdxBeforeBody + 1, finalIdxBeforeBody + (1 + bodyLength));
  return {
    meta,
    bodyData,
  };
};

export const batchPoll = async (
  serverUrl: string,
  roomInfos: Set<string>,
  abortSignal: AbortSignal
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

  const batchRequest = await getBatchRequest(serverPublicKey, roomId);
  console.warn({ batchRequest });

  if (!batchRequest) {
    window?.log?.error('Could not generate batch request. Aborting request');
    return;
  }

  sendOpenGroupBatchRequest(serverUrl, serverPublicKey, batchRequest, abortSignal);
  // sendOpenGroupBatchRequest(serverUrl, serverPublicKey, batchRequest, abortSignal, true);
};

const getBatchRequest = async (
  serverPublicKey: string,
  roomId: string
): Promise<BatchRequest | undefined> => {
  const endpoint = '/batch';
  const method = 'POST';

  // TODO: hardcoding batch request for capabilities and messages for now.
  // TODO: add testing
  const batchCommands: Array<BatchSubRequest> = [
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
  const headers = batchCommands
    ? await getOurOpenGroupHeaders(
        serverPublicKey,
        endpoint,
        method,
        false,
        JSON.stringify(batchCommands)
      )
    : await getOurOpenGroupHeaders(serverPublicKey, endpoint, method, false);

  if (!headers) {
    window?.log?.error('Unable to create headers for batch request - aborting');
    return;
  }

  return {
    endpoint: '/batch',
    method: 'POST',
    body: JSON.stringify(batchCommands),
    headers,
  };
};

const getOurOpenGroupHeaders = async (
  serverPublicKey: string,
  endpoint: string,
  method: string,
  blinded: boolean,
  body?: string
) => {
  // todo: refactor open group headers to just get our device.
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(16);

  const signingKeys = await UserUtils.getUserED25519KeyPairBytes();
  if (!signingKeys) {
    console.warn('Unable to get signing keys');
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);

  return getOpenGroupHeaders({
    signingKeys,
    serverPK: fromHexToArray(serverPublicKey),
    nonce,
    method,
    path: endpoint,
    timestamp,
    blinded,
    body,
  });
};

const sendOpenGroupBatchRequest = async (
  serverUrl: string,
  serverPubkey: string,
  request: BatchRequest,
  abortSignal: AbortSignal,
  useV4: boolean = false
): Promise<any> => {
  const { endpoint, headers, method, body } = request;

  let res;
  if (useV4) {
    const batchRequestV4 = encodeV4Request(JSON.stringify(request.headers), request.body);
    console.warn({ batchRequestV4 });
  } else {
    const builtUrl = new URL(`${serverUrl}/${endpoint}`);
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

export const capabilitiesFetchEverything = async (
  serverUrl: string,
  rooms: Set<string>,
  abortSignal: AbortSignal
): Promise<Array<ParsedRoomCompactPollResults> | null> => {
  const capabilityRequest = await getCapabilityFetchRequest(serverUrl, rooms);

  if (!capabilityRequest) {
    window?.log?.info('Nothing found to be fetched. returning');
    return null;
  }

  const result = await sendOpenGroupCapabilityRequest(capabilityRequest, abortSignal);
  return result ? result : null;
};

/**
 * This function fetches the valid roomInfos from the database.
 * It also makes sure that the pubkey for all those rooms are the same, or returns null.
 */
const getAllValidRoomInfos = async (
  serverUrl: string,
  rooms: Set<string>
): Promise<Array<OpenGroupV2Room> | null> => {
  const allServerPubKeys: Array<string> = [];

  // fetch all the roomInfos for the specified rooms.
  // those invalid (like, not found in db) are excluded (with lodash compact)
  const validRoomInfos = _.compact(
    await Promise.all(
      [...rooms].map(async roomId => {
        try {
          const fetchedInfo = await getV2OpenGroupRoomByRoomId({
            serverUrl,
            roomId,
          });
          if (!fetchedInfo) {
            window?.log?.warn('Could not find this room getMessages');
            return null;
          }
          allServerPubKeys.push(fetchedInfo.serverPublicKey);
          const tokenInProgress = await getAuthToken({ serverUrl, roomId });

          return { ...fetchedInfo, token: tokenInProgress || undefined };
        } catch (e) {
          window?.log?.warn('failed to fetch roominfos for room', roomId);
          return null;
        }
      })
    )
  );
  if (!validRoomInfos?.length) {
    return null;
  }
  // double check that all those server pubkeys are the same
  let firstPubkey: string;
  if (allServerPubKeys?.length) {
    firstPubkey = allServerPubKeys[0];
    const allMatch = allServerPubKeys.every(p => p === firstPubkey);
    if (!allMatch) {
      window?.log?.warn('All pubkeys do not match:', allServerPubKeys);
      return null;
    }
  } else {
    window?.log?.warn('No pubkeys found:', allServerPubKeys);
    return null;
  }
  return validRoomInfos;
};

const getCapabilityFetchRequest = async (
  serverUrl: string,
  rooms: Set<string>
): Promise<null | OpenGroupCapabilityRequest> => {
  const allValidRoomInfos = await getAllValidRoomInfos(serverUrl, rooms);
  if (!allValidRoomInfos?.length) {
    window?.log?.info('compactPoll: no valid roominfos got.');
    return null;
  }
  const endpoint = '/capabilities';
  const method = 'GET';
  const serverPubkey = allValidRoomInfos[0].serverPublicKey;

  const capabilityHeaders = await getOurOpenGroupHeaders(serverPubkey, endpoint, method, true);
  if (!capabilityHeaders) {
    return null;
  }

  return {
    server: serverUrl,
    serverPubKey: serverPubkey,
    endpoint,
    headers: capabilityHeaders,
  };
};

async function sendOpenGroupCapabilityRequest(
  request: OpenGroupCapabilityRequest,
  abortSignal: AbortSignal
): Promise<any | null> {
  const { server: serverUrl, endpoint, serverPubKey, headers } = request;
  // this will throw if the url is not valid

  const builtUrl = new URL(`${serverUrl}/${endpoint}`);

  console.warn({ batchUrl: builtUrl });

  const res = await sendViaOnionToNonSnode(
    serverPubKey,
    builtUrl,
    {
      method: 'GET',
      headers,
      body: undefined,
    },
    {},
    abortSignal
  );

  console.warn({ capabilityRequest: res });

  const statusCode = parseStatusCodeFromOnionRequest(res);
  if (!statusCode) {
    window?.log?.warn('Capabilities Request Got unknown status code; res:', res);
    // return null;
  }

  return res;
}

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
