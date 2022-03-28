import { getV2OpenGroupRoomByRoomId, OpenGroupV2Room } from '../../../../data/opengroups';
import { OpenGroupCapabilityRequest } from './ApiUtil';
import { parseStatusCodeFromOnionRequest } from './OpenGroupAPIV2Parser';
import _ from 'lodash';
import { sendViaOnionToNonSnode } from '../../../onions/onionSend';
import { OpenGroupMessageV2 } from './OpenGroupMessageV2';
import { getAuthToken } from './ApiAuth';
import { UserUtils } from '../../../utils';
import { fromHexToArray } from '../../../utils/String';
import { KeyPair } from 'libsodium-wrappers-sumo';
import { getSodium } from '../../../crypto';
import { getOpenGroupHeaders } from './OpenGroupAuthentication';

// export const testV4Request = async (req: OpenGroupCapabilityRequest) => {
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
 *
 */
export const decodeV4Response = (response: string) => {
  // json part will have code: containing response code and headers for http headers (always lower case)
  // 1. read first bit till colon to get the length. Substring the next X amount trailing the colon and that's the metadata.
  // 2. grab the number before the next colon. That's the expected length of the body.
  // 3. Use the content type from the metadata header to handle the body.
  console.warn('TO IMPLEMENT', response);
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
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(16);

  const userED25519KeyPair = await UserUtils.getUserED25519KeyPair();
  if (!userED25519KeyPair) {
    return null;
  }
  const serverPubkey = allValidRoomInfos[0].serverPublicKey;
  const signingKeys: KeyPair = {
    keyType: 'ed25519',
    publicKey: fromHexToArray(userED25519KeyPair.pubKey),
    privateKey: fromHexToArray(userED25519KeyPair.privKey),
  }; // @@: make getHeaders just accept the hex version of the keys or make util function to get it as bytes
  console.warn('signingKeys', signingKeys);

  console.info('=========== serverpk: ', serverPubkey);
  console.info('=========== serverpk uint: ', fromHexToArray(serverPubkey));

  const capabilityHeaders = await getOpenGroupHeaders({
    signingKeys,
    serverPK: fromHexToArray(serverPubkey),
    nonce,
    method,
    path: endpoint,
    timestamp: Math.floor(Date.now() / 1000),
    blinded: true,
  });

  // getAllValidRoomInfos return null if the room have not all the same serverPublicKey.
  // so being here, we know this is the case
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

  const statusCode = parseStatusCodeFromOnionRequest(res);
  if (!statusCode) {
    window?.log?.warn('Capabilities Request Got unknown status code; res:', res);
    return null;
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
