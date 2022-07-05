import AbortController from 'abort-controller';
import { compact } from 'lodash';
import { OpenGroupV2Room } from '../../../../data/opengroups';
import { sendJsonViaOnionV4ToNonSnode } from '../../../onions/onionSend';
import { OpenGroupV2Info } from '../opengroupV2/ApiUtil';

export const getAllRoomInfos = async (roomInfos: OpenGroupV2Room) => {
  const res = await sendJsonViaOnionV4ToNonSnode({
    blinded: false,
    endpoint: '/rooms',
    method: 'GET',
    serverPubkey: roomInfos.serverPublicKey,
    stringifiedBody: null,
    abortSignal: new AbortController().signal,
    serverUrl: roomInfos.serverUrl,
    headers: null,
    doNotIncludeOurSogsHeaders: true,
  });

  if (res?.status_code === 200) {
    return parseRooms(res);
  }

  window?.log?.warn('getAllRoomInfos failed invalid status code:', res?.status_code);
  return;
};

const parseRooms = (jsonResult?: Record<string, any>): undefined | Array<OpenGroupV2Info> => {
  if (!jsonResult) {
    return undefined;
  }
  const rooms = jsonResult?.body as Array<any>;

  if (!rooms || !rooms.length) {
    window?.log?.warn('getAllRoomInfos failed invalid infos');
    return [];
  }
  return compact(
    rooms.map(room => {
      // check that the room is correctly filled
      const { token: id, name, image_id: imageId } = room;
      if (!id || !name) {
        window?.log?.info('getAllRoomInfos: Got invalid room details, skipping');
        return null;
      }

      return { id, name, imageId } as OpenGroupV2Info;
    })
  );
};
