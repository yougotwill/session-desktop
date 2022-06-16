import { APPLICATION_JSON } from '../../../../types/MIME';
import { sendJsonViaOnionV4ToNonSnode } from '../../../onions/onionSend';
import { UserUtils } from '../../../utils';
import { OpenGroupCapabilityRequest } from '../opengroupV2/ApiUtil';
import { parseStatusCodeFromOnionRequestV4 } from '../opengroupV2/OpenGroupAPIV2Parser';
import { OpenGroupMessageV2 } from '../opengroupV2/OpenGroupMessageV2';
import {
  getAllValidRoomInfos,
  OpenGroupRequestHeaders,
} from '../opengroupV2/OpenGroupPollingUtils';

export function addJsonContentTypeToHeaders(
  headers: OpenGroupRequestHeaders
): OpenGroupRequestHeaders {
  return { ...headers, 'Content-Type': APPLICATION_JSON };
}

export type OpenGroupSendMessageRequest = OpenGroupCapabilityRequest & {
  blinded: boolean;
};

export const sendMessageOnionV4 = async (
  serverUrl: string,
  room: string,
  abortSignal: AbortSignal,
  message: OpenGroupMessageV2,
  blinded: boolean
): Promise<OpenGroupMessageV2 | null> => {
  const allValidRoomInfos = await getAllValidRoomInfos(serverUrl, new Set([room]));
  if (!allValidRoomInfos?.length) {
    window?.log?.info('getSendMessageRequest: no valid roominfos got.');
    return null;
  }
  const endpoint = `/room/${room}/message`;
  const method = 'POST';
  const serverPubkey = allValidRoomInfos[0].serverPublicKey;
  const ourKeyPair = await UserUtils.getIdentityKeyPair();
  const signedMessage = await message.sign(ourKeyPair);
  const json = signedMessage.toJson();
  const stringifiedBody = JSON.stringify(json);
  // blinded and unblinded are exactly the same at this level. blinded is handled inside sendJsonViaOnionV4ToNonSnode for both cases
  const res = await sendJsonViaOnionV4ToNonSnode({
    serverUrl,
    endpoint,
    serverPubkey,
    method,
    abortSignal,
    blinded,
    stringifiedBody,
  });
  const statusCode = parseStatusCodeFromOnionRequestV4(res);
  if (!statusCode) {
    window?.log?.warn('sendSogsMessageWithOnionV4 Got unknown status code; res:', res);
    return null;
  }

  if (statusCode !== 201) {
    throw new Error(`Could not postMessage, status code: ${statusCode}`);
  }

  if (!res) {
    throw new Error('Could not postMessage, res is invalid');
  }
  const rawMessage = res.body as Record<string, any>;
  if (!rawMessage) {
    throw new Error('postMessage parsing failed');
  }

  const toParse = {
    data: rawMessage.data,
    server_id: rawMessage.id,
    public_key: rawMessage.session_id,
    timestamp: rawMessage.posted,
    signature: rawMessage.signature,
  };

  // this will throw if the json is not valid
  const parsed = OpenGroupMessageV2.fromJson(toParse);
  return parsed;
};
