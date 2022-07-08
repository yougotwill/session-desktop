// tslint:disable: cyclomatic-complexity

import { OnionPaths } from '.';
import {
  FinalRelayOptions,
  sendOnionRequestHandlingSnodeEject,
  SnodeResponse,
  SnodeResponseV4,
  STATUS_NO_STATUS,
} from '../apis/snode_api/onions';
import _, { toNumber } from 'lodash';
import { PROTOCOLS } from '../constants';
import { toHex } from '../utils/String';
import pRetry from 'p-retry';
import { Snode } from '../../data/data';
import { decodeV4Response } from './onionv4';
import { getOurOpenGroupHeaders } from '../apis/open_group_api/opengroupV2/OpenGroupPollingUtils';
import {
  addBinaryContentTypeToHeaders,
  addJsonContentTypeToHeaders,
} from '../apis/open_group_api/sogsv3/sogsV3SendMessage';
import { AbortSignal } from 'abort-controller';
import { pnServerPubkeyHex, pnServerUrl } from '../apis/push_notification_api/PnServer';
import { fileServerPubKey, fileServerURL } from '../apis/file_server_api/FileServerApi';

export type OnionFetchOptions = {
  method: string;
  body?: string | Uint8Array;
  headers?: Record<string, string | number>;
  useV4: boolean;
};

type OnionPayloadObj = {
  method: string;
  endpoint: string;
  body: string | Uint8Array | undefined | null;
  headers: Record<string, any>;
};

export type FinalDestinationOptions = {
  destination_ed25519_hex?: string;
  headers?: Record<string, string>;
  body?: string;
};

const buildSendViaOnionPayload = (url: URL, fetchOptions: OnionFetchOptions): OnionPayloadObj => {
  const tempHeaders = fetchOptions.headers || {};
  const payloadObj = {
    method: fetchOptions.method || 'GET',
    body: fetchOptions.body || (undefined as any),
    // safety issue with file server, just safer to have this
    // no initial /
    endpoint: url.pathname,
    headers: fetchOptions.headers || {},
  };
  if (url.search) {
    payloadObj.endpoint += url.search;
  }

  payloadObj.headers = tempHeaders;
  return payloadObj;
};

export const getOnionPathForSending = async () => {
  let pathNodes: Array<Snode> = [];
  try {
    pathNodes = await OnionPaths.getOnionPath({});
  } catch (e) {
    window?.log?.error(`sendViaOnion - getOnionPath Error ${e.code} ${e.message}`);
  }
  if (!pathNodes?.length) {
    window?.log?.warn('sendViaOnion - failing, no path available');
    // should we retry?
    return null;
  }
  return pathNodes;
};

export type OnionSnodeResponse = {
  result: SnodeResponse;
  txtResponse: string;
  response: string;
};

export type OnionV4SnodeResponse = {
  body: string | object | null; // if the content can be decoded as string
  bodyBinary: Uint8Array | null; // otherwise we return the raw content (could be an image data or file from sogs/fileserver)
  status_code: number;
};

export type OnionV4JSONSnodeResponse = {
  body: Record<string, any> | null;
  status_code: number;
};

export type OnionV4BinarySnodeResponse = {
  bodyBinary: Uint8Array | null;
  status_code: number;
};

export const sendViaOnionV4ToNonSnode = async (
  destinationX25519Key: string,
  url: URL,
  fetchOptions: OnionFetchOptions,
  abortSignal?: AbortSignal
): Promise<OnionV4SnodeResponse | null> => {
  if (!fetchOptions.useV4) {
    throw new Error('sendViaOnionV4ToNonSnode is only to be used for onion v4 calls');
  }
  const castedDestinationX25519Key =
    typeof destinationX25519Key !== 'string' ? toHex(destinationX25519Key) : destinationX25519Key;

  const payloadObj = buildSendViaOnionPayload(url, fetchOptions);
  // if protocol is forced to 'http:' => just use http (without the ':').
  // otherwise use https as protocol (this is the default)
  const forcedHttp = url.protocol === PROTOCOLS.HTTP;
  const finalRelayOptions: FinalRelayOptions = {
    host: url.hostname,
  };

  if (forcedHttp) {
    finalRelayOptions.protocol = 'http';
  }
  if (forcedHttp) {
    finalRelayOptions.port = url.port ? toNumber(url.port) : 80;
  }

  let result: SnodeResponseV4 | undefined;
  try {
    result = await pRetry(
      async () => {
        const pathNodes = await getOnionPathForSending();

        if (!pathNodes) {
          throw new Error('getOnionPathForSending is emtpy');
        }

        /**
         * This call handles ejecting a snode or a path if needed. If that happens, it throws a retryable error and the pRetry
         * call above will call us again with the same params but a different path.
         * If the error is not recoverable, it throws a pRetry.AbortError.
         */
        return sendOnionRequestHandlingSnodeEject({
          nodePath: pathNodes,
          destX25519Any: castedDestinationX25519Key,
          finalDestOptions: payloadObj,
          finalRelayOptions,
          abortSignal,
          useV4: true,
        });
      },
      {
        // retries: 2, // retry 3 (2+1) times at most
        retries: 0, // FIXME audric rollback retry 3 (2+1) times at most
        minTimeout: 500,
        onFailedAttempt: e => {
          window?.log?.warn(
            `sendViaOnionV4ToNonSnodeRetryable attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left...`
          );
        },
      }
    );
  } catch (e) {
    window?.log?.warn('sendViaOnionV4ToNonSnodeRetryable failed ', e.message);
    return null;
  }

  if (abortSignal?.aborted) {
    window?.log?.warn('sendViaOnionV4ToNonSnodeRetryable request aborted.');

    return null;
  }

  if (!result) {
    // v4 failed responses result is undefined
    window?.log?.warn('sendViaOnionV4ToNonSnodeRetryable failed during V4 request');
    return null;
  }

  try {
    // this only decodes single entries
    const decodedV4 = decodeV4Response(result);
    return {
      status_code: decodedV4?.metadata?.code || STATUS_NO_STATUS,
      body: decodedV4?.body || null,
      bodyBinary: decodedV4?.bodyBinary || null,
    };
  } catch (e) {
    window?.log?.error("sendViaOnionV4ToNonSnode Can't decode JSON body");
    return { status_code: STATUS_NO_STATUS, body: null, bodyBinary: null };
  }
};

export async function sendJsonViaOnionV4ToSogs(sendOptions: {
  serverUrl: string;
  endpoint: string;
  serverPubkey: string;
  blinded: boolean;
  method: string;
  stringifiedBody: string | null;
  abortSignal: AbortSignal;
  doNotIncludeOurSogsHeaders?: boolean;
  headers: Record<string, any> | null;
}): Promise<OnionV4JSONSnodeResponse | null> {
  const {
    serverUrl,
    endpoint,
    serverPubkey,
    method,
    blinded,
    stringifiedBody,
    abortSignal,
    headers: includedHeaders,
    doNotIncludeOurSogsHeaders,
  } = sendOptions;
  if (!endpoint.startsWith('/')) {
    throw new Error('endpoint needs a leading /');
  }
  const builtUrl = new URL(`${serverUrl}${endpoint}`);
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
      headers: addJsonContentTypeToHeaders(headersWithSogsHeadersIfNeeded as any),
      body: stringifiedBody || undefined,
      useV4: true,
    },
    abortSignal
  );

  return res as OnionV4JSONSnodeResponse;
}

/**
 * Send some json to the PushNotification server.
 * Desktop only send `/notify` requests.
 *
 * You should probably not use this function directly but instead rely on the PnServer.notifyPnServer() function
 */
export async function sendJsonViaOnionV4ToPnServer(sendOptions: {
  endpoint: string;
  method: string;
  stringifiedBody: string | null;
  abortSignal: AbortSignal;
}): Promise<OnionV4JSONSnodeResponse | null> {
  const { endpoint, method, stringifiedBody, abortSignal } = sendOptions;
  if (!endpoint.startsWith('/')) {
    throw new Error('endpoint needs a leading /');
  }
  const builtUrl = new URL(`${pnServerUrl}${endpoint}`);

  const res = await sendViaOnionV4ToNonSnode(
    pnServerPubkeyHex,
    builtUrl,
    {
      method,
      headers: undefined,
      body: stringifiedBody || undefined,
      useV4: true,
    },
    abortSignal
  );

  return res as OnionV4JSONSnodeResponse;
}

export async function sendBinaryViaOnionV4ToSogs(sendOptions: {
  serverUrl: string;
  endpoint: string;
  serverPubkey: string;
  blinded: boolean;
  method: string;
  bodyBinary: Uint8Array;
  abortSignal: AbortSignal;
  headers: Record<string, any> | null;
}): Promise<OnionV4JSONSnodeResponse | null> {
  const {
    serverUrl,
    endpoint,
    serverPubkey,
    method,
    blinded,
    bodyBinary,
    abortSignal,
    headers: includedHeaders,
  } = sendOptions;

  if (!bodyBinary) {
    return null;
  }
  if (!endpoint.startsWith('/')) {
    throw new Error('endpoint needs a leading /');
  }
  const builtUrl = new URL(`${serverUrl}${endpoint}`);
  let headersWithSogsHeadersIfNeeded = await getOurOpenGroupHeaders(
    serverPubkey,
    endpoint,
    method,
    blinded,
    bodyBinary
  );

  if (!headersWithSogsHeadersIfNeeded) {
    return null;
  }
  headersWithSogsHeadersIfNeeded = { ...includedHeaders, ...headersWithSogsHeadersIfNeeded };
  const res = await sendViaOnionV4ToNonSnode(
    serverPubkey,
    builtUrl,
    {
      method,
      headers: addBinaryContentTypeToHeaders(headersWithSogsHeadersIfNeeded as any),
      body: bodyBinary || undefined,
      useV4: true,
    },
    abortSignal
  );

  return res as OnionV4JSONSnodeResponse;
}

/**
 *
 * FILE SERVER REQUESTS
 *
 */

/**
 * Upload binary to the file server.
 * You should probably not use this function directly, but instead rely on the FileServerAPI.uploadFileToFsWithOnionV4()
 */
export async function sendBinaryViaOnionV4ToFileServer(sendOptions: {
  endpoint: string;
  method: string;
  bodyBinary: Uint8Array;
  abortSignal: AbortSignal;
}): Promise<OnionV4JSONSnodeResponse | null> {
  const { endpoint, method, bodyBinary, abortSignal } = sendOptions;
  if (!endpoint.startsWith('/')) {
    throw new Error('endpoint needs a leading /');
  }
  const builtUrl = new URL(`${fileServerURL}${endpoint}`);

  const res = await sendViaOnionV4ToNonSnode(
    fileServerPubKey,
    builtUrl,
    {
      method,
      headers: undefined,
      body: bodyBinary,
      useV4: true,
    },
    abortSignal
  );

  return res as OnionV4JSONSnodeResponse;
}

/**
 * Download binary from the file server.
 * You should probably not use this function directly, but instead rely on the FileServerAPI.downloadFileFromFileServer()
 */
export async function getBinaryViaOnionV4FromFileServer(sendOptions: {
  endpoint: string;
  method: string;
  abortSignal: AbortSignal;
}): Promise<OnionV4BinarySnodeResponse | null> {
  const { endpoint, method, abortSignal } = sendOptions;
  if (!endpoint.startsWith('/')) {
    throw new Error('endpoint needs a leading /');
  }
  const builtUrl = new URL(`${fileServerURL}${endpoint}`);

  const res = await sendViaOnionV4ToNonSnode(
    fileServerPubKey,
    builtUrl,
    {
      method,
      headers: undefined,
      body: undefined,
      useV4: true,
    },
    abortSignal
  );

  return res as OnionV4BinarySnodeResponse;
}

/**
 * Send some generic json to the fileserver.
 * This function should probably not used directly as we only need it for the FileServerApi.getLatestReleaseFromFileServer() function
 */
export async function sendJsonViaOnionV4ToFileServer(sendOptions: {
  endpoint: string;
  method: string;
  stringifiedBody: string | null;
  abortSignal: AbortSignal;
}): Promise<OnionV4JSONSnodeResponse | null> {
  const { endpoint, method, stringifiedBody, abortSignal } = sendOptions;
  if (!endpoint.startsWith('/')) {
    throw new Error('endpoint needs a leading /');
  }
  const builtUrl = new URL(`${fileServerURL}${endpoint}`);

  const res = await sendViaOnionV4ToNonSnode(
    fileServerPubKey,
    builtUrl,
    {
      method,
      headers: undefined,
      body: stringifiedBody || undefined,
      useV4: true,
    },
    abortSignal
  );

  return res as OnionV4JSONSnodeResponse;
}
