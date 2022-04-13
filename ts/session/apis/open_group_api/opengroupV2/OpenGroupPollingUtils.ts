import { getV2OpenGroupRoomByRoomId, OpenGroupV2Room } from '../../../../data/opengroups';
import _ from 'lodash';
import { OpenGroupMessageV2 } from './OpenGroupMessageV2';
import { getAuthToken } from './ApiAuth';
import { UserUtils } from '../../../utils';
import { fromHexToArray } from '../../../utils/String';
import { concatUInt8Array, getSodium } from '../../../crypto';
import { getOpenGroupHeaders } from './OpenGroupAuthentication';
import { to_base64 } from 'libsodium-wrappers-sumo';

export type OpenGroupRequestHeaders = {
  'X-SOGS-Pubkey': string;
  'X-SOGS-Timestamp': string | number;
  'X-SOGS-Signature': string;
  'X-SOGS-Nonce': string;
  /** content-type required for batch requests */
  'Content-Type'?: string;
};

export const encodeV4Request = (requestInfo: any): Uint8Array => {
  // for reference
  //   {
  //     "method": "POST",
  //     "body": "[{\"method\":\"GET\",\"path\":\"/capabilities\"},{\"method\":\"GET\",\"path\":\"/room/omg/messages/recent?limit=25\"}]",
  //     "endpoint": "/batch",
  //     "headers": {
  //         "X-SOGS-Pubkey": "0020be78d4c4755e6595cb240f404bc245138e27d6f06b9f6d47e7328af3d6d95d",
  //         "X-SOGS-Timestamp": "1649595222",
  //         "X-SOGS-Nonce": "5AJvZK87oSoPoiuFQKy7xA==",
  //         "X-SOGS-Signature": "z6DEbF83e3VrYk+gozizZT6Wb2Lp2QPscUq2V2MdFO+ZV8dsdM5wCeAxNCHgpqdTs160Boj9ygYjxhQLe6ERAA==",
  //         "Content-Type": "application/json"
  //     }
  // }

  // TODO: we ned to remove the leading forward slash for non-legacy endpoints.
  // legacy needs the leading slash.
  // requestInfo.endpoint =
  //   requestInfo.endpoint.charAt(0) === '/' ? requestInfo.endpoint.substr(1) : requestInfo.endpoint;
  const { body } = requestInfo;
  const requestInfoData = Buffer.from(JSON.stringify(requestInfo), 'ascii');
  const bodyData = Buffer.from(body, 'ascii');
  const prefixData = Buffer.from(`l${requestInfoData.length}:`, 'ascii');
  const suffixData = Buffer.from('e', 'ascii');
  if (body) {
    const bodyCountdata = Buffer.from(`${bodyData.length}:`, 'ascii');
    return concatUInt8Array(prefixData, requestInfoData, bodyCountdata, bodyData, suffixData);
  } else {
    return concatUInt8Array(prefixData, requestInfoData, suffixData);
  }
};

export type ResponseDecodedV4 = {
  metadata: {
    code: number;
    headers: any;
  };
  body: any;
  bodyContentType: string;
};

/**
 * Nearly identical to request encoding. 2 string bencoded list.
 * Response differs in that the second body part is always present in a response unlike the requests.
 * 1. First part contains response metadata
 * 2. Second part contains the request body.
 */
export const decodeV4Response = (response: string): ResponseDecodedV4 | undefined => {
  // json part will have code: containing response code and headers for http headers (always lower case)
  // 1. read first bit till colon to get the length. Substring the next X amount trailing the colon and that's the metadata.
  // 2. grab the number before the next colon. That's the expected length of the body.
  // 3. Use the content type from the metadata header to handle the body.
  if (!(response.startsWith('l') && response.endsWith('e'))) {
    window?.log?.error(
      'Batch response is missing prefix and suffix characters - Dropping response'
    );
    return;
  }

  const firstDelimitIdx = response.indexOf(':');
  const metaLength = parseInt(response.slice(1, firstDelimitIdx));

  const metaStartIndex = firstDelimitIdx + 1;
  const metaEndIndex = metaStartIndex + metaLength;
  const metadata = JSON.parse(response.slice(metaStartIndex, metaEndIndex));

  const beforeBodyIndex = response.indexOf(':', metaEndIndex);
  const bodyLength = parseInt(response.slice(metaEndIndex, beforeBodyIndex));
  const bodyText = response.slice(beforeBodyIndex + 1, beforeBodyIndex + (1 + bodyLength));

  const bodyContentType: string = metadata?.headers['content-type'];
  let bodyParsed;
  switch (bodyContentType) {
    // TODO; add cases for other data types
    case 'application/json':
      bodyParsed = JSON.parse(bodyText);
      break;
    default:
      window?.log?.warn('decodeV4Response - No content-type information for response');
  }

  return {
    metadata,
    body: bodyParsed,
    bodyContentType,
  };
};

export const getOurOpenGroupHeaders = async (
  serverPublicKey: string,
  endpoint: string,
  method: string,
  blinded: boolean,
  body?: string
): Promise<OpenGroupRequestHeaders | undefined> => {
  // todo: refactor open group headers to just get our device.
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(16);

  console.warn('Nonce: ', to_base64(nonce));

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

/**
 * This function fetches the valid roomInfos from the database.
 * It also makes sure that the pubkey for all those rooms are the same, or returns null.
 */
export const getAllValidRoomInfos = async (
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
