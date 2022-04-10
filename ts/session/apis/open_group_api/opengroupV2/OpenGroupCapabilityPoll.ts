import { OpenGroupCapabilityRequest } from './ApiUtil';
import { parseStatusCodeFromOnionRequest } from './OpenGroupAPIV2Parser';
import _ from 'lodash';
import { sendViaOnionToNonSnode } from '../../../onions/onionSend';
import { getAllValidRoomInfos, getOurOpenGroupHeaders } from './OpenGroupPollingUtils';
import { OpenGroupMessageV2 } from './OpenGroupMessageV2';

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

export const getCapabilityFetchRequest = async (
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

export async function sendOpenGroupCapabilityRequest(
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
    abortSignal,
    true
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
