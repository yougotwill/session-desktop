import { getV2OpenGroupRoomByRoomId, saveV2OpenGroupRoom } from '../../../../data/opengroups';
import { FSv2 } from '../../file_server_api';
import { sendBinaryViaOnionV4ToNonSnode, sendViaOnionToNonSnode } from '../../../onions/onionSend';
import { OpenGroupRequestCommonType, OpenGroupV2Request } from './ApiUtil';
import { parseStatusCodeFromOnionRequest } from './OpenGroupAPIV2Parser';

import { isOpenGroupV2Request } from '../../file_server_api/FileServerApiV2';
import pRetry from 'p-retry';
import { callUtilsWorker } from '../../../../webworker/workers/util_worker_interface';
import AbortController from 'abort-controller';
import { roomHasBlindEnabled } from '../sogsv3/sogsV3Capabilities';

// used to be overwritten by testing
export const getMinTimeout = () => 1000;

/**
 * This function returns a base url to this room
 * This is basically used for building url after posting an attachment
 * hasRoomInEndpoint = true means the roomId is already in the endpoint.
 * so we don't add the room after the serverUrl.
 *
 */
function getCompleteEndpointUrl(
  roomInfos: OpenGroupRequestCommonType,
  endpoint: string,
  hasRoomInEndpoint: boolean
) {
  // serverUrl has the port and protocol already
  if (!hasRoomInEndpoint) {
    return `${roomInfos.serverUrl}/${roomInfos.roomId}/${endpoint}`;
  }
  // not room based, the endpoint already has the room in it
  return `${roomInfos.serverUrl}/${endpoint}`;
}

const getDestinationPubKey = async (
  request: OpenGroupV2Request | FSv2.FileServerV2Request
): Promise<string> => {
  if (FSv2.isOpenGroupV2Request(request)) {
    if (!request.serverPublicKey) {
      const roomDetails = getV2OpenGroupRoomByRoomId({
        serverUrl: request.server,
        roomId: request.room,
      });
      if (!roomDetails?.serverPublicKey) {
        throw new Error('PublicKey not found for this server.');
      }
      return roomDetails.serverPublicKey;
    } else {
      return request.serverPublicKey;
    }
  } else {
    // this is a fileServer call
    return FSv2.fileServerV2PubKey;
  }
};

/**
 *
 * This send function is to be used for all non polling stuff.
 * This function can be used for OpengroupV2 request OR File Server V2 request
 * Download and upload of attachments for instance, but most of the logic happens in
 * the batch_poll endpoint.
 *
 */
export async function sendApiV2Request(
  request: OpenGroupV2Request | FSv2.FileServerV2Request
): Promise<Object | null> {
  const builtUrl = FSv2.buildUrl(request);

  if (!builtUrl) {
    throw new Error('Invalid request');
  }

  if (!window.getGlobalOnlineStatus()) {
    throw new pRetry.AbortError('Network is not available');
  }
  // set the headers sent by the caller, and the roomId.
  const headers = request.headers || {};
  if (FSv2.isOpenGroupV2Request(request)) {
    headers.Room = request.room;
  }

  let body = '';
  if (request.method !== 'GET') {
    body = JSON.stringify(request.queryParams);
  }

  const destinationX25519Key = await getDestinationPubKey(request);

  // Because auth happens on a per-room basis, we need both to make an authenticated request
  if (isOpenGroupV2Request(request) && request.room) {
    const res = await sendViaOnionToNonSnode(destinationX25519Key, builtUrl, {
      method: request.method,
      headers,
      body,
      useV4: request.useV4,
    });

    const statusCode = parseStatusCodeFromOnionRequest(res);
    if (!statusCode) {
      window?.log?.warn('sendOpenGroupV2Request Got unknown status code; res:', res);
      return res as object;
    }
    // A 401 means that we didn't provide a (valid) auth token for a route that required one. We use this as an
    // indication that the token we're using has expired.
    // Note that a 403 has a different meaning; it means that
    // we provided a valid token but it doesn't have a high enough permission level for the route in question.
    if (statusCode === 401) {
      const roomDetails = getV2OpenGroupRoomByRoomId({
        serverUrl: request.server,
        roomId: request.room,
      });
      if (!roomDetails) {
        window?.log?.warn('Got 401, but this room does not exist');
        return null;
      }
      // we might need to retry doing the request here, but how to make sure we don't retry indefinetely?
      await saveV2OpenGroupRoom(roomDetails);
    }
    return res as object;
  } else {
    // no need for auth, just do the onion request
    const res = await sendViaOnionToNonSnode(destinationX25519Key, builtUrl, {
      method: request.method,
      headers,
      body,
      useV4: request.useV4,
    });
    return res as object;
  }
}

export const downloadFileOpenGroupV2ByUrl = async (
  pathName: string,
  roomInfos: OpenGroupRequestCommonType
): Promise<Uint8Array | null> => {
  const request: OpenGroupV2Request = {
    method: 'GET',
    room: roomInfos.roomId,
    server: roomInfos.serverUrl,
    endpoint: pathName,
    useV4: false,
  };

  const result = await exports.sendApiV2Request(request);
  const statusCode = parseStatusCodeFromOnionRequest(result);
  if (statusCode !== 200) {
    return null;
  }

  // we should probably change the logic of sendOnionRequest to not have all those levels
  const base64Data = result?.result?.result as string | undefined;

  if (!base64Data) {
    return null;
  }
  return new Uint8Array(await callUtilsWorker('fromBase64ToArrayBuffer', base64Data));
};

/**
 * Returns the id on which the file is saved, or null
 */
export const uploadFileOpenGroupV3 = async (
  fileContent: Uint8Array,
  roomInfos: OpenGroupRequestCommonType
): Promise<{ fileId: number; fileUrl: string } | null> => {
  if (!fileContent || !fileContent.length) {
    return null;
  }

  const roomDetails = getV2OpenGroupRoomByRoomId(roomInfos);
  if (!roomDetails || !roomDetails.serverPublicKey) {
    window.log.warn('uploadFileOpenGroupV3: roomDetails is invalid');
    return null;
  }

  const result = await sendBinaryViaOnionV4ToNonSnode({
    abortSignal: new AbortController().signal,
    blinded: roomHasBlindEnabled(roomDetails),
    bodyBinary: fileContent,
    headers: null,
    serverPubkey: roomDetails.serverPublicKey,
    endpoint: `/room/${roomDetails.roomId}/file`,
    method: 'POST',
    serverUrl: roomDetails.serverUrl,
  });

  if (result?.status_code !== 201) {
    return null;
  }

  // we should probably change the logic of sendOnionRequest to not have all those levels
  const fileId = (result?.body as any | undefined)?.id as number | undefined;
  if (!fileId) {
    return null;
  }
  const fileUrl = getCompleteEndpointUrl(
    roomInfos,
    `/room/${roomDetails.roomId}/file/${fileId}`,
    false
  );
  return {
    fileId,
    fileUrl,
  };
};

export const uploadImageForRoomOpenGroupV3 = async (
  fileContent: Uint8Array,
  roomInfos: OpenGroupRequestCommonType
): Promise<{ fileUrl: string } | null> => {
  if (!fileContent || !fileContent.length) {
    return null;
  }

  const queryParams = {
    file: await callUtilsWorker('arrayBufferToStringBase64', fileContent),
  };

  const imageEndpoint = `room/${roomInfos.roomId}/file`;
  const request: OpenGroupV2Request = {
    method: 'POST',
    room: roomInfos.roomId,
    server: roomInfos.serverUrl,
    endpoint: imageEndpoint,
    queryParams,
    useV4: false,
  };

  const result = await exports.sendApiV2Request(request);
  const statusCode = parseStatusCodeFromOnionRequest(result);
  if (statusCode !== 200) {
    return null;
  }
  const fileUrl = getCompleteEndpointUrl(roomInfos, `${imageEndpoint}`, true);
  return {
    fileUrl,
  };
};
