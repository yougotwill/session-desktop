import _, { isArray, isEmpty, isEqual, isObject } from 'lodash';
import { sendJsonViaOnionV4ToNonSnode } from '../../../onions/onionSend';
import { getOurOpenGroupHeaders } from '../opengroupV2/OpenGroupPollingUtils';
import {
  getV2OpenGroupRoomsByServerUrl,
  OpenGroupV2Room,
  saveV2OpenGroupRoom,
} from '../../../../data/opengroups';
import AbortController, { AbortSignal } from 'abort-controller';

export const capabilitiesFetchForServer = async (
  serverUrl: string,
  serverPubKey: string,
  abortSignal: AbortSignal
): Promise<Array<string> | null> => {
  const endpoint = '/capabilities';
  const method = 'GET';
  const serverPubkey = serverPubKey;
  const blinded = false; // for capabilities, blinding is always false as the request will fail if the server requires blinding
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
    doNotIncludeOurSogsHeaders: true, // the first capabilities needs to not have any authentification to pass on a blinding-required sogs,
    headers: null,
  });

  const statusCode = result?.status_code;
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

export async function fetchCapabilitiesAndUpdateRelatedRoomsOfServerUrl(serverUrl: string) {
  let relatedRooms = getV2OpenGroupRoomsByServerUrl(serverUrl);
  if (!relatedRooms || relatedRooms.length === 0) {
    return;
  }

  // we actually don't do that call using batch send for now to avoid having to deal with the headers in batch poll.
  // thoses 2 requests below needs to not have sogs header at all and are unauthenticated

  const capabilities = await capabilitiesFetchForServer(
    serverUrl,
    relatedRooms[0].serverPublicKey,
    new AbortController().signal
  );
  if (!capabilities) {
    return;
  }
  // just fetch updated data from the DB, just in case
  relatedRooms = getV2OpenGroupRoomsByServerUrl(serverUrl);
  if (!relatedRooms || relatedRooms.length === 0) {
    return;
  }
  const newSortedCaps = capabilities.sort();

  await Promise.all(
    relatedRooms.map(async room => {
      if (!isEqual(newSortedCaps, room.capabilities?.sort() || '')) {
        room.capabilities = newSortedCaps;
        await saveV2OpenGroupRoom(room);
      }
    })
  );
  return newSortedCaps;
}
