import { AbortSignal } from 'abort-controller';
import { Reaction } from '../../../../types/Reaction';
import { OnionSending } from '../../../onions/onionSend';
import { OpenGroupMessageV2 } from '../opengroupV2/OpenGroupMessageV2';
import { OpenGroupPollingUtils } from '../opengroupV2/OpenGroupPollingUtils';
import { batchGlobalIsSuccess, parseBatchGlobalStatusCode } from './sogsV3BatchPoll';

export const sendSogsReactionOnionV4 = async (
  serverUrl: string,
  room: string,
  abortSignal: AbortSignal,
  reaction: Reaction,
  blinded: boolean
): Promise<OpenGroupMessageV2> => {
  const allValidRoomInfos = OpenGroupPollingUtils.getAllValidRoomInfos(serverUrl, new Set([room]));
  if (!allValidRoomInfos?.length) {
    window?.log?.info('getSendReactionRequest: no valid roominfos got.');
    throw new Error(`Could not find sogs pubkey of url:${serverUrl}`);
  }

  const endpoint = `/room/${room}/reaction/${reaction.id}/${reaction.emoji}`;
  const method = reaction.action === 0 ? 'PUT' : 'DELETE';
  const serverPubkey = allValidRoomInfos[0].serverPublicKey;

  // reaction endpoint requires an empty dict {}
  const stringifiedBody = null;
  const result = await OnionSending.sendJsonViaOnionV4ToSogs({
    serverUrl,
    endpoint,
    serverPubkey,
    method,
    abortSignal,
    blinded,
    stringifiedBody,
    headers: null,
    throwErrors: true,
  });

  if (!batchGlobalIsSuccess(result)) {
    window?.log?.warn('sendSogsReactionWithOnionV4 Got unknown status code; res:', result);
    throw new Error(
      `sendSogsReactionOnionV4: invalid status code: ${parseBatchGlobalStatusCode(result)}`
    );
  }

  if (!result) {
    throw new Error('Could not putReaction, res is invalid');
  }
  console.log('opengroup reaction result', result);
  const rawMessage = result.body as Record<string, any>;
  if (!rawMessage) {
    throw new Error('putReaction parsing failed');
  }

  const toParse = {
    data: rawMessage.data,
    server_id: rawMessage.id,
    public_key: rawMessage.session_id,
    timestamp: Math.floor(rawMessage.posted * 1000),
    signature: rawMessage.signature,
  };

  // this will throw if the json is not valid
  const parsed = OpenGroupMessageV2.fromJson(toParse);
  return parsed;
};
