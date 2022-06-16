import {
  getV2OpenGroupRoomByRoomId,
  OpenGroupV2Room,
  saveV2OpenGroupRoom,
} from '../../../../data/opengroups';
import { FSv2 } from '../../file_server_api';
import { sendJsonViaOnionV4ToNonSnode, sendViaOnionToNonSnode } from '../../../onions/onionSend';
import { PubKey } from '../../../types';
import { OpenGroupRequestCommonType, OpenGroupV2Info, OpenGroupV2Request } from './ApiUtil';
import { parseRooms, parseStatusCodeFromOnionRequest } from './OpenGroupAPIV2Parser';

import { isOpenGroupV2Request } from '../../file_server_api/FileServerApiV2';
import pRetry from 'p-retry';
import { callUtilsWorker } from '../../../../webworker/workers/util_worker_interface';
import {
  capabilitiesFetchAllForRooms,
  capabilitiesListHasBlindEnabled,
} from '../sogsv3/sogsV3Capabilities';
import { uniq } from 'lodash';

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
      const roomDetails = await getV2OpenGroupRoomByRoomId({
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
 * the compact_poll endpoint.
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
    const res = await sendViaOnionToNonSnode(
      destinationX25519Key,
      builtUrl,
      {
        method: request.method,
        headers,
        body,
        useV4: request.useV4,
      },
      { noJson: true }
    );

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
      const roomDetails = await getV2OpenGroupRoomByRoomId({
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

/**
 *
 */
export async function openGroupV2GetRoomInfo({
  serverUrl,
  roomId,
}: {
  roomId: string;
  serverUrl: string;
}): Promise<OpenGroupV2Info | null> {
  const abortSignal = new AbortController().signal;
  const caps = await capabilitiesFetchAllForRooms(serverUrl, new Set([roomId]), abortSignal);

  if (!caps || caps.length === 0) {
    window?.log?.warn('getInfo failed because capabilities failed');
    return null;
  }

  const hasBlindingEnabled = capabilitiesListHasBlindEnabled(caps);
  window?.log?.info(`openGroupV2GetRoomInfo capabilities for  ${serverUrl}:${roomId}: ${caps}`);

  const result = await sendJsonViaOnionV4ToNonSnode({
    blinded: hasBlindingEnabled,
    method: 'GET',
    serverUrl,
    endpoint: `/legacy/rooms/${roomId}`,
    abortSignal,
    stringifiedBody: null,
    serverPubkey: 'a37f6ac417b9bc33ae8b4b6a4c7a4330070a171a9317be100e961262af203e4d',
  });
  const room = (result?.body as any)?.room as Record<string, any> | undefined;
  if (room) {
    const { id, name, image_id: imageId } = room;

    if (!id || !name) {
      window?.log?.warn('getRoominfo Parsing failed');
      return null;
    }

    const info: OpenGroupV2Info = {
      id,
      name,
      imageId,
      capabilities: caps ? uniq(caps) : undefined,
    };
    return info;
  }
  window?.log?.warn('getInfo failed');
  return null;
}

export const banUser = async (
  userToBan: PubKey,
  roomInfos: OpenGroupRequestCommonType,
  deleteAllMessages: boolean
): Promise<boolean> => {
  const queryParams = { public_key: userToBan.key };
  const endpoint = deleteAllMessages ? 'ban_and_delete_all' : 'block_list';
  const request: OpenGroupV2Request = {
    method: 'POST',
    room: roomInfos.roomId,
    server: roomInfos.serverUrl,
    queryParams,
    endpoint,
    useV4: false,
  };
  const banResult = await exports.sendApiV2Request(request);
  const isOk = parseStatusCodeFromOnionRequest(banResult) === 200;
  return isOk;
};

export const unbanUser = async (
  userToBan: PubKey,
  roomInfos: OpenGroupRequestCommonType
): Promise<boolean> => {
  const request: OpenGroupV2Request = {
    method: 'DELETE',
    room: roomInfos.roomId,
    server: roomInfos.serverUrl,
    endpoint: `block_list/${userToBan.key}`,
    useV4: false,
  };
  const unbanResult = await exports.sendApiV2Request(request);
  const isOk = parseStatusCodeFromOnionRequest(unbanResult) === 200;
  return isOk;
};

/**
 * Deletes messages on open group server
 */
export const deleteMessageByServerIds = async (
  idsToRemove: Array<number>,
  roomInfos: OpenGroupRequestCommonType
): Promise<boolean> => {
  const request: OpenGroupV2Request = {
    method: 'POST',
    room: roomInfos.roomId,
    server: roomInfos.serverUrl,
    endpoint: 'delete_messages',
    queryParams: { ids: idsToRemove },
    useV4: false,
  };
  const messageDeletedResult = await exports.sendApiV2Request(request);
  const isOk = parseStatusCodeFromOnionRequest(messageDeletedResult) === 200;
  return isOk;
};

export const getAllRoomInfos = async (roomInfos: OpenGroupV2Room) => {
  const res = await sendJsonViaOnionV4ToNonSnode({
    blinded: false,
    endpoint: '/legacy/rooms',
    method: 'GET',
    serverPubkey: roomInfos.serverPublicKey,
    stringifiedBody: null,
    abortSignal: new AbortController().signal,
    serverUrl: roomInfos.serverUrl,
  });

  if (res?.status_code === 200) {
    return parseRooms(res);
  }

  window?.log?.warn('getAllRoomInfos failed invalid status code:', res?.status_code);
  return;
};

/**
 * File upload and download
 */

export const downloadFileOpenGroupV2 = async (
  fileId: number,
  roomInfos: OpenGroupRequestCommonType
): Promise<Uint8Array | null> => {
  if (!fileId) {
    window?.log?.warn('downloadFileOpenGroupV2: FileId cannot be unset. returning null');
    return null;
  }
  const request: OpenGroupV2Request = {
    method: 'GET',
    room: roomInfos.roomId,
    server: roomInfos.serverUrl,
    endpoint: `files/${fileId}`,
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
 * Download the preview image for that opengroup room.
 * The returned value is a base64 string.
 * It can be used directly, or saved on the attachments directory if needed, but this function does not handle it
 */
export const downloadPreviewOpenGroupV2 = async (
  roomInfos: OpenGroupV2Room
): Promise<string | null> => {
  const request: OpenGroupV2Request = {
    method: 'GET',
    room: roomInfos.roomId,
    server: roomInfos.serverUrl,
    endpoint: `rooms/${roomInfos.roomId}/image`,
    serverPublicKey: roomInfos.serverPublicKey,
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
  return base64Data;
};

/**
 * Returns the id on which the file is saved, or null
 */
export const uploadFileOpenGroupV2 = async (
  fileContent: Uint8Array,
  roomInfos: OpenGroupRequestCommonType
): Promise<{ fileId: number; fileUrl: string } | null> => {
  if (!fileContent || !fileContent.length) {
    return null;
  }
  const queryParams = {
    file: await callUtilsWorker('arrayBufferToStringBase64', fileContent),
  };

  const filesEndpoint = 'files';
  const request: OpenGroupV2Request = {
    method: 'POST',
    room: roomInfos.roomId,
    server: roomInfos.serverUrl,
    endpoint: filesEndpoint,
    queryParams,
    useV4: false,
  };

  const result = await exports.sendApiV2Request(request);
  const statusCode = parseStatusCodeFromOnionRequest(result);
  if (statusCode !== 200) {
    return null;
  }

  // we should probably change the logic of sendOnionRequest to not have all those levels
  const fileId = result?.result?.result as number | undefined;
  if (!fileId) {
    return null;
  }
  const fileUrl = getCompleteEndpointUrl(roomInfos, `${filesEndpoint}/${fileId}`, false);
  return {
    fileId: fileId,
    fileUrl,
  };
};

export const uploadImageForRoomOpenGroupV2 = async (
  fileContent: Uint8Array,
  roomInfos: OpenGroupRequestCommonType
): Promise<{ fileUrl: string } | null> => {
  if (!fileContent || !fileContent.length) {
    return null;
  }

  const queryParams = {
    file: await callUtilsWorker('arrayBufferToStringBase64', fileContent),
  };

  const imageEndpoint = `rooms/${roomInfos.roomId}/image`;
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

/** MODERATORS ADD/REMOVE */

export const addModerator = async (
  userToAddAsMods: PubKey,
  roomInfos: OpenGroupRequestCommonType
): Promise<boolean> => {
  const request: OpenGroupV2Request = {
    method: 'POST',
    room: roomInfos.roomId,
    server: roomInfos.serverUrl,
    queryParams: { public_key: userToAddAsMods.key, room_id: roomInfos.roomId },
    endpoint: 'moderators',
    useV4: false,
  };
  const addModResult = await exports.sendApiV2Request(request);
  const isOk = parseStatusCodeFromOnionRequest(addModResult) === 200;
  return isOk;
};

export const removeModerator = async (
  userToRemoveFromMods: PubKey,
  roomInfos: OpenGroupRequestCommonType
): Promise<boolean> => {
  const request: OpenGroupV2Request = {
    method: 'DELETE',
    room: roomInfos.roomId,
    server: roomInfos.serverUrl,
    endpoint: `moderators/${userToRemoveFromMods.key}`,
    useV4: false,
  };
  const removeModResult = await exports.sendApiV2Request(request);
  const isOk = parseStatusCodeFromOnionRequest(removeModResult) === 200;
  return isOk;
};
