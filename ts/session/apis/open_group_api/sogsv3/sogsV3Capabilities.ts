import _, { isArray, isEmpty, isObject } from 'lodash';
import { sendJsonViaOnionV4ToNonSnode } from '../../../onions/onionSend';
import { getOurOpenGroupHeaders } from '../opengroupV2/OpenGroupPollingUtils';
import { parseStatusCodeFromOnionRequestV4 } from '../opengroupV2/OpenGroupAPIV2Parser';
import { OpenGroupV2Room } from '../../../../data/opengroups';
import { AbortSignal } from 'abort-controller';

export const capabilitiesFetchForServer = async (
  serverUrl: string,
  serverPubKey: string,
  abortSignal: AbortSignal
): Promise<Array<string> | null> => {
  const endpoint = '/capabilities';
  const method = 'GET';
  const serverPubkey = serverPubKey;
  const blinded = true; // for capabilities, blinding is always enabled as the request will fail if the server requires blinding
  const capabilityHeaders = await getOurOpenGroupHeaders(
    serverPubkey,
    endpoint,
    method,
    blinded,
    null
  );
  if (!capabilityHeaders) {
    return null;
  }

  const result = await sendJsonViaOnionV4ToNonSnode({
    abortSignal,
    blinded,
    endpoint,
    method,
    serverPubkey,
    serverUrl,
    stringifiedBody: null,
  });

  const statusCode = parseStatusCodeFromOnionRequestV4(result);
  if (!statusCode) {
    window?.log?.warn('Capabilities Request Got unknown status code; res:', result);
    return null;
  }

  const parsedCapabilities = result?.body ? parseCapabilities(result.body) : [];
  return parsedCapabilities;
};

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
  return capabilitiesListHasBlindEnabled(openGroup?.capabilities);
}

export function capabilitiesListHasBlindEnabled(caps?: Array<string> | null) {
  return Boolean(caps?.includes('blind'));
}
