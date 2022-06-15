import { APPLICATION_JSON } from '../../../../types/MIME';
import { sendViaOnionV4ToNonSnode } from '../../../onions/onionSend';
import { UserUtils } from '../../../utils';
import { OpenGroupCapabilityRequest } from '../opengroupV2/ApiUtil';
import { parseStatusCodeFromOnionRequestV4 } from '../opengroupV2/OpenGroupAPIV2Parser';
import { OpenGroupMessageV2 } from '../opengroupV2/OpenGroupMessageV2';
import {
  getAllValidRoomInfos,
  getOurOpenGroupHeaders,
  OpenGroupRequestHeaders,
} from '../opengroupV2/OpenGroupPollingUtils';
import { roomHasBlindEnabled } from './sogsV3Capabilities';

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
  if (!blinded) {
    const allValidRoomInfos = await getAllValidRoomInfos(serverUrl, new Set([room]));
    if (!allValidRoomInfos?.length) {
      window?.log?.info('getSendMessageRequest: no valid roominfos got.');
      return null;
    }
    const endpoint = `/room/${room}/message`;
    const method = 'POST';
    const serverPubkey = allValidRoomInfos[0].serverPublicKey;

    const ourKeyPair = await UserUtils.getIdentityKeyPair();
    const builtUrl = new URL(`${serverUrl}/${endpoint}`);

    const signedMessage = await message.sign(ourKeyPair);
    const json = signedMessage.toJson();
    const stringifiedBody = JSON.stringify(json);
    const headers = await getOurOpenGroupHeaders(
      serverPubkey,
      endpoint,
      method,
      blinded,
      stringifiedBody
    );
    if (!headers) {
      return null;
    }
    const res = await sendViaOnionV4ToNonSnode(
      serverPubkey,
      builtUrl,
      {
        method,
        headers: addJsonContentTypeToHeaders(headers),
        body: stringifiedBody,
        useV4: true,
      },
      {},
      abortSignal
    );
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
    debugger;

    // this will throw if the json is not valid
    const parsed = OpenGroupMessageV2.fromJson(toParse);
    return parsed;
  }

  //     throw new Error('blinded send todo');
  //     const ourKeyPair = await UserUtils.getIdentityKeyPair();

  //     const signedMessage = await message.sign(ourKeyPair);
  //     const json = signedMessage.toJson();
  //     const res = await sendViaOnionV4ToNonSnode(
  //       serverPubKey,
  //       builtUrl,
  //       {
  //         method,
  //         headers,
  //         body: JSON.stringify(json),
  //         useV4: true,
  //       },
  //       {},
  //       abortSignal
  //     );

  //     debugger;
  //     const statusCode = parseStatusCodeFromOnionRequestV4(res);
  //     if (!statusCode) {
  //       window?.log?.warn('sendSogsMessageWithOnionV4 Got unknown status code; res:', res);
  //       return null;
  //     }

  //     if (statusCode !== 200) {
  //       throw new Error(`Could not postMessage, status code: ${statusCode}`);
  //     }
  //     const rawMessage = result?.result?.message;
  //     if (!rawMessage) {
  //       throw new Error('postMessage parsing failed');
  //     }
  //     // this will throw if the json is not valid
  //     return OpenGroupMessageV2.fromJson(rawMessage);
  //   }

  //   const parsedCapabilities = res?.body ? parseCapabilities(res.body) : [];
  //   return parsedCapabilities;
};
