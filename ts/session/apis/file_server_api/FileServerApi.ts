import AbortController from 'abort-controller';
import { BlindingActions } from '../../../webworker/workers/browser/libsession_worker_interface';
import { OnionSending, OnionV4JSONSnodeResponse } from '../../onions/onionSend';
import {
  batchGlobalIsSuccess,
  parseBatchGlobalStatusCode,
} from '../open_group_api/sogsv3/sogsV3BatchPoll';
import { fromUInt8ArrayToBase64 } from '../../utils/String';
import { NetworkTime } from '../../../util/NetworkTime';
import { DURATION } from '../../constants';
import { getOSArchitecture, getOSPlatform } from '../../../OS';
import type { ReleaseChannels } from '../../../updater/types';
import { Storage } from '../../../util/storage';

export const fileServerHost = 'mighty-needles-bet.loca.lt';
export const fileServerURL = `http://${fileServerHost}`;

export const fileServerPubKey = '367da0a01664d497c325f3f2e8de4af81c1f175de6f308a6c733bb5df726636a';
const RELEASE_VERSION_ENDPOINT = '/session_version';

const POST_GET_FILE_ENDPOINT = '/file';

/**
 * Upload a file to the file server v2 using the onion v4 encoding
 * @param fileContent the data to send
 * @returns null or the fileID and complete URL to share this file
 */
export const uploadFileToFsWithOnionV4 = async (
  fileContent: ArrayBuffer
): Promise<{ fileId: number; fileUrl: string } | null> => {
  if (!fileContent || !fileContent.byteLength) {
    return null;
  }

  const result = await OnionSending.sendBinaryViaOnionV4ToFileServer({
    abortSignal: new AbortController().signal,
    bodyBinary: new Uint8Array(fileContent),
    endpoint: POST_GET_FILE_ENDPOINT,
    method: 'POST',
    timeoutMs: 30 * DURATION.SECONDS, // longer time for file upload
  });

  if (!batchGlobalIsSuccess(result)) {
    return null;
  }

  const fileId = result?.body?.id as number | undefined;
  if (!fileId) {
    return null;
  }
  const fileUrl = `${fileServerURL}${POST_GET_FILE_ENDPOINT}/${fileId}`;
  return {
    fileId,
    fileUrl,
  };
};

/**
 * Download a file given the fileId from the fileserver
 * @param fileIdOrCompleteUrl the fileId to download or the completeUrl to the fileitself
 * @returns the data as an Uint8Array or null
 */
export const downloadFileFromFileServer = async (
  fileIdOrCompleteUrl: string
): Promise<ArrayBuffer | null> => {
  let fileId = fileIdOrCompleteUrl;
  if (!fileIdOrCompleteUrl) {
    window?.log?.warn('Empty url to download for fileserver');
    return null;
  }

  if (fileIdOrCompleteUrl.lastIndexOf('/') >= 0) {
    fileId = fileId.substring(fileIdOrCompleteUrl.lastIndexOf('/') + 1);
  }

  if (fileId.startsWith('/')) {
    fileId = fileId.substring(1);
  }

  if (!fileId) {
    window.log.info('downloadFileFromFileServer given empty fileId');
    return null;
  }

  const urlToGet = `${POST_GET_FILE_ENDPOINT}/${fileId}`;
  if (window.sessionFeatureFlags?.debug.debugFileServerRequests) {
    window.log.info(`about to try to download fsv2: "${urlToGet}"`);
  }

  // this throws if we get a 404 from the file server
  const result = await OnionSending.getBinaryViaOnionV4FromFileServer({
    abortSignal: new AbortController().signal,
    endpoint: urlToGet,
    method: 'GET',
    throwError: true,
    timeoutMs: 30 * DURATION.SECONDS, // longer time for file download
  });
  if (window.sessionFeatureFlags?.debug.debugFileServerRequests) {
    window.log.info(`download fsv2: "${urlToGet} got result:`, JSON.stringify(result));
  }
  if (!result) {
    return null;
  }

  if (!batchGlobalIsSuccess(result)) {
    window.log.info(
      'download from fileserver failed with status ',
      parseBatchGlobalStatusCode(result)
    );
    return null;
  }

  const { bodyBinary } = result;
  if (!bodyBinary || !bodyBinary.byteLength) {
    window.log.info('download from fileserver failed with status, empty content downloaded ');
    return null;
  }

  return bodyBinary.buffer;
};

const parseStatusCodeFromOnionRequestV4 = (
  onionV4Result: OnionV4JSONSnodeResponse | null
): number | undefined => {
  if (!onionV4Result) {
    return undefined;
  }
  return onionV4Result?.body?.status_code || undefined;
};

/**
 * Fetch the latest desktop release available on github from the fileserver.
 * This call is onion routed and so do not expose our ip to github nor the file server.
 */
export const getLatestReleaseFromFileServer = async (
  userEd25519SecretKey: Uint8Array,
  releaseType?: ReleaseChannels
): Promise<[string, ReleaseChannels] | null> => {
  const sigTimestampSeconds = NetworkTime.getNowWithNetworkOffsetSeconds();
  const blindedPkHex = await BlindingActions.blindVersionPubkey({
    ed25519SecretKey: userEd25519SecretKey,
  });
  const method = 'GET';
  let releaseChannel = Storage.get('releaseChannel') as ReleaseChannels;

  if (!releaseChannel) {
    releaseChannel = 'latest';
    await Storage.put('releaseChannel', releaseChannel);
  }

  const endpoint = `${RELEASE_VERSION_ENDPOINT}?platform=desktop&os=${getOSPlatform()}&arch=${getOSArchitecture()}${releaseChannel ? `&release_channel=${releaseType || releaseChannel}` : ''}`;

  const signature = await BlindingActions.blindVersionSignRequest({
    ed25519SecretKey: userEd25519SecretKey,
    sigTimestampSeconds,
    sigMethod: method,
    sigPath: endpoint,
    sigBody: null,
  });

  const headers = {
    'X-FS-Pubkey': blindedPkHex,
    'X-FS-Timestamp': `${sigTimestampSeconds}`,
    'X-FS-Signature': fromUInt8ArrayToBase64(signature),
  };

  const params = {
    abortSignal: new AbortController().signal,
    endpoint,
    method,
    stringifiedBody: null,
    headers,
    timeoutMs: 10 * DURATION.SECONDS,
  };
  const result = await OnionSending.sendJsonViaOnionV4ToFileServer(params);

  if (!batchGlobalIsSuccess(result) || parseStatusCodeFromOnionRequestV4(result) !== 200) {
    return null;
  }

  // we should probably change the logic of sendOnionRequestNoRetries to not have all those levels
  const latestVersionWithV = (result?.body as any)?.result;
  if (!latestVersionWithV) {
    return null;
  }
  return [latestVersionWithV, releaseType || releaseChannel];
};
