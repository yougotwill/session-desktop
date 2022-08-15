import AbortController from 'abort-controller';
import { OpenGroupRequestCommonType } from '../opengroupV2/ApiUtil';
import {
  batchFirstSubIsSuccess,
  batchGlobalIsSuccess,
  OpenGroupBatchRow,
  sogsBatchSend,
} from './sogsV3BatchPoll';

/**
 * Deletes a reaction on open group server using onion v4 logic and batch send
 * User must have moderator permissions
 */
export const deleteSogsReactionByServerId = async (
  reaction: string,
  serverId: number,
  roomInfos: OpenGroupRequestCommonType
): Promise<boolean> => {
  const options: Array<OpenGroupBatchRow> = [
    {
      type: 'deleteReaction',
      deleteReaction: { reaction, messageId: serverId, roomId: roomInfos.roomId },
    },
  ];
  const result = await sogsBatchSend(
    roomInfos.serverUrl,
    new Set([roomInfos.roomId]),
    new AbortController().signal,
    options,
    'batch'
  );

  try {
    return batchGlobalIsSuccess(result) && batchFirstSubIsSuccess(result);
  } catch (e) {
    window?.log?.error("deleteSogsReactionByServerId Can't decode JSON body");
  }
  return false;
};
