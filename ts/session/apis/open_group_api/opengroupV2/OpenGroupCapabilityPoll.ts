import { OpenGroupCapabilityRequest } from './ApiUtil';
import _, { isArray } from 'lodash';
import { sendViaOnionV4ToNonSnode } from '../../../onions/onionSend';
import { getAllValidRoomInfos, getOurOpenGroupHeaders } from './OpenGroupPollingUtils';
import { ParsedRoomCompactPollResults } from './OpenGroupAPIV2CompactPoll';
import { parseStatusCodeFromOnionRequestV4 } from './OpenGroupAPIV2Parser';

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
    useV4: true, // before we make that request, we are unsure if the server supports v4 or not.
    // We need to do that one (and it to succeed) to make sure the server understands v4 onion requests
  };
};

async function sendOpenGroupCapabilityRequest(
  request: OpenGroupCapabilityRequest,
  abortSignal: AbortSignal
): Promise<any | null> {
  const { server: serverUrl, endpoint, serverPubKey, headers, useV4 } = request;
  // this will throw if the url is not valid

  const builtUrl = new URL(`${serverUrl}/${endpoint}`);
  const res = await sendViaOnionV4ToNonSnode(
    serverPubKey,
    builtUrl,
    {
      method: 'GET',
      headers,
      useV4,
    },
    {},
    abortSignal
  );

  // We do not check for status code for this call, but just check the results we get
  const statusCode = parseStatusCodeFromOnionRequestV4(res);
  if (!statusCode) {
    window?.log?.warn('Capabilities Request Got unknown status code; res:', res);
    return null;
  }

  const respAny = res?.body;
  if (respAny?.capabilities && isArray(respAny)) {
    return res;
  }
  return null;
}

export type ParsedBase64Avatar = {
  roomId: string;
  base64: string;
};

export type ParsedMemberCount = {
  roomId: string;
  memberCount: number;
};
