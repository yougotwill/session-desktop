import AbortController from 'abort-controller';
import { getV2OpenGroupRoomByRoomId } from '../../../../data/opengroups';
import { OnionSending } from '../../../onions/onionSend';
import { OpenGroupRequestCommonType } from '../opengroupV2/ApiUtil';
import { batchGlobalIsSuccess } from './sogsV3BatchPoll';
import { roomHasBlindEnabled } from './sogsV3Capabilities';

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

/**
 * Returns the id on which the file is saved, or null
 */
export const uploadFileToRoomSogs3 = async (
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

  const result = await OnionSending.sendBinaryViaOnionV4ToSogs({
    abortSignal: new AbortController().signal,
    blinded: roomHasBlindEnabled(roomDetails),
    bodyBinary: fileContent,
    headers: null,
    serverPubkey: roomDetails.serverPublicKey,
    endpoint: `/room/${roomDetails.roomId}/file`,
    method: 'POST',
    serverUrl: roomDetails.serverUrl,
  });

  if (!batchGlobalIsSuccess(result)) {
    return null;
  }

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
