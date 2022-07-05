import AbortController, { AbortSignal } from 'abort-controller';
import { OpenGroupV2Room } from '../../../../data/opengroups';
import { callUtilsWorker } from '../../../../webworker/workers/util_worker_interface';
import { sendViaOnionV4ToNonSnode } from '../../../onions/onionSend';
import { getOurOpenGroupHeaders } from '../opengroupV2/OpenGroupPollingUtils';
import { roomHasBlindEnabled } from './sogsV3Capabilities';

export async function fetchBinaryFromSogsWithOnionV4(sendOptions: {
  serverUrl: string;
  serverPubkey: string;
  blinded: boolean;
  abortSignal: AbortSignal;
  doNotIncludeOurSogsHeaders?: boolean;
  headers: Record<string, any> | null;
  roomId: string;
  fileId: string;
}): Promise<Uint8Array | null> {
  const {
    serverUrl,
    serverPubkey,
    blinded,
    abortSignal,
    headers: includedHeaders,
    doNotIncludeOurSogsHeaders,
    roomId,
    fileId,
  } = sendOptions;

  const stringifiedBody = null;
  const method = 'GET';
  const endpoint = `/room/${roomId}/file/${fileId}`;

  const builtUrl = new URL(`${serverUrl}/${endpoint}`);
  let headersWithSogsHeadersIfNeeded = doNotIncludeOurSogsHeaders
    ? {}
    : await getOurOpenGroupHeaders(serverPubkey, endpoint, method, blinded, stringifiedBody);

  if (!headersWithSogsHeadersIfNeeded) {
    return null;
  }
  headersWithSogsHeadersIfNeeded = { ...includedHeaders, ...headersWithSogsHeadersIfNeeded };
  const res = await sendViaOnionV4ToNonSnode(
    serverPubkey,
    builtUrl,
    {
      method,
      headers: headersWithSogsHeadersIfNeeded,
      body: stringifiedBody || undefined,
      useV4: true,
    },
    abortSignal
  );
  if (!res?.bodyBinary) {
    window.log.info('fetchBinaryFromSogsWithOnionV4 no binary content');
    return null;
  }
  return res.bodyBinary;
}

/**
 * Download the preview image for that opengroup room.
 * The returned value is a base64 string.
 * It can be used directly, or saved on the attachments directory if needed, but this function does not handle it.
 * Be sure to give the imageID field here, otherwise the request is dropped.
 */
export const sogsV3FetchPreview = async (roomInfos: OpenGroupV2Room): Promise<string | null> => {
  if (!roomInfos || !roomInfos.imageID) {
    return null;
  }

  console.warn('should we turn this blinded ON?');
  const fetched = await fetchBinaryFromSogsWithOnionV4({
    abortSignal: new AbortController().signal,
    blinded: false,
    headers: null,
    serverPubkey: roomInfos.serverPublicKey,
    serverUrl: roomInfos.serverUrl,
    doNotIncludeOurSogsHeaders: true,
    roomId: roomInfos.roomId,
    fileId: roomInfos.imageID,
  });
  if (fetched && fetched.byteLength) {
    return callUtilsWorker('arrayBufferToStringBase64', fetched.buffer);
  }
  return null;
};

/**
 * Download the file fileID in that opengroup room.
 * The returned value is a base64 string.
 * It can be used directly, or saved on the attachments directory if needed, but this function does not handle it.
 */
export const sogsV3FetchFileByFileID = async (
  roomInfos: OpenGroupV2Room,
  fileId: string
): Promise<Uint8Array | null> => {
  if (!roomInfos || !roomInfos.imageID) {
    return null;
  }

  const fetched = await fetchBinaryFromSogsWithOnionV4({
    abortSignal: new AbortController().signal,
    blinded: roomHasBlindEnabled(roomInfos),
    headers: null,
    serverPubkey: roomInfos.serverPublicKey,
    serverUrl: roomInfos.serverUrl,
    doNotIncludeOurSogsHeaders: true,
    roomId: roomInfos.roomId,
    fileId,
  });
  return fetched && fetched.byteLength ? fetched : null;
};
