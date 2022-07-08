import { OnionV4JSONSnodeResponse } from '../../../onions/onionSend';

/**
 * An onion request to the open group api returns something like
 * {result: {status_code:number; whatever: somerandomtype}; }
 *
 * This utility function just extract the status code and returns it.
 * If the status code is not found, this function returns undefined;
 */
export const parseStatusCodeFromOnionRequest = (onionResult: any): number | undefined => {
  if (!onionResult) {
    return undefined;
  }
  const statusCode = onionResult?.result?.status_code;
  if (statusCode) {
    return statusCode;
  }
  return undefined;
};

export const parseStatusCodeFromOnionRequestV4 = (
  onionV4Result: OnionV4JSONSnodeResponse | null
): number | undefined => {
  if (!onionV4Result) {
    return undefined;
  }
  return onionV4Result?.body?.status_code || undefined;
};
