import { OpenGroupCapabilityRequest } from '../opengroupV2/ApiUtil';
import _, { isArray, isEmpty, isObject } from 'lodash';
import { sendViaOnionV4ToNonSnode } from '../../../onions/onionSend';
import { getAllValidRoomInfos, getOurOpenGroupHeaders } from '../opengroupV2/OpenGroupPollingUtils';
import { parseStatusCodeFromOnionRequestV4 } from '../opengroupV2/OpenGroupAPIV2Parser';
import { OpenGroupV2Room } from '../../../../data/opengroups';

export const capabilitiesFetchAllForRooms = async (
  serverUrl: string,
  rooms: Set<string>,
  abortSignal: AbortSignal
): Promise<Array<string> | null> => {
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
    window?.log?.info('getCapabilityFetchRequest: no valid roominfos got.');
    return null;
  }
  const endpoint = '/capabilities';
  const method = 'GET';
  const serverPubkey = allValidRoomInfos[0].serverPublicKey;

  const capabilityHeaders = await getOurOpenGroupHeaders(
    serverPubkey,
    endpoint,
    method,
    true,
    null
  );
  if (!capabilityHeaders) {
    return null;
  }

  return {
    server: serverUrl,
    serverPubKey: serverPubkey,
    endpoint,
    headers: capabilityHeaders,
    useV4: true,
    method,
    // We need to do that one (and it to succeed) to make sure the server understands v4 onion requests
  };
};

async function sendOpenGroupCapabilityRequest(
  request: OpenGroupCapabilityRequest,
  abortSignal: AbortSignal
): Promise<Array<string> | null> {
  const { server: serverUrl, endpoint, method, serverPubKey, headers } = request;
  // this will throw if the url is not valid

  const builtUrl = new URL(`${serverUrl}/${endpoint}`);
  const res = await sendViaOnionV4ToNonSnode(
    serverPubKey,
    builtUrl,
    {
      method,
      headers,
      useV4: true,
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

  const parsedCapabilities = res?.body ? parseCapabilities(res.body) : [];
  return parsedCapabilities;
}

/**
 * @param body is the object containing a .capabilities field we should extract the list from.
 * @returns the sorted list of capabilities contained in that response, or null
 */
export function parseCapabilities(body: any): null | Array<string> {
  if (!body || isEmpty(body) || !isObject(body) || !isArray(body.capabilities)) {
    return null;
  }
  return ((body.capabilities as Array<string>) || []).sort();
}

export type ParsedBase64Avatar = {
  roomId: string;
  base64: string;
};

export type ParsedMemberCount = {
  roomId: string;
  memberCount: number;
};

export function roomHasBlindEnabled(openGroup?: OpenGroupV2Room) {
  return Boolean(openGroup?.capabilities?.includes('blind'));
}
