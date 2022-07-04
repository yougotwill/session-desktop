/** MODERATORS ADD/REMOVE */

import AbortController from 'abort-controller';
import { PubKey } from '../../../types';
import { OpenGroupRequestCommonType } from '../opengroupV2/ApiUtil';
import { sogsBatchSend } from './sogsV3BatchPoll';

/**
 * Add those pubkeys as admins.
 * We do not support adding as moderators/visible/global for now in session desktop
 */
export const sogsV3AddAdmin = async (
  usersToAddAsMods: Array<PubKey>,
  roomInfos: OpenGroupRequestCommonType
): Promise<boolean> => {
  const batchSendResponse = await sogsBatchSend(
    roomInfos.serverUrl,
    new Set([roomInfos.roomId]),
    new AbortController().signal,
    [
      {
        type: 'addRemoveModerators',
        addRemoveModerators: {
          sessionIds: usersToAddAsMods.map(m => m.key),
          roomId: roomInfos.roomId,
          type: 'add_mods',
        },
      },
    ]
  );
  return batchSendResponse?.body?.[0]?.code === 200;
};

/**
 * Add those pubkeys from admins.
 * We do not support removing as moderators/visible/global for now in session desktop
 */
export const sogsV3RemoveAdmins = async (
  usersToRemoveFromMods: Array<PubKey>,
  roomInfos: OpenGroupRequestCommonType
): Promise<boolean> => {
  const batchSendResponse = await sogsBatchSend(
    roomInfos.serverUrl,
    new Set([roomInfos.roomId]),
    new AbortController().signal,
    [
      {
        type: 'addRemoveModerators',
        addRemoveModerators: {
          sessionIds: usersToRemoveFromMods.map(m => m.key),
          roomId: roomInfos.roomId,
          type: 'remove_mods',
        },
      },
    ]
  );
  return batchSendResponse?.body?.every(m => m?.code === 200) || false;
};
