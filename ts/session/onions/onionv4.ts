import { from_string } from 'libsodium-wrappers-sumo';
import { toNumber } from 'lodash';
import { concatUInt8Array } from '../crypto';

export const encodeV4Request = (requestInfo: { body?: any }): Uint8Array => {
  const { body } = requestInfo;
  const requestInfoData = from_string(JSON.stringify(requestInfo));
  const prefixData = from_string(`l${requestInfoData.length}:`);
  const suffixData = from_string('e');
  if (body) {
    const bodyData = from_string(body);

    const bodyCountdata = from_string(`${bodyData.length}:`);
    return concatUInt8Array(prefixData, requestInfoData, bodyCountdata, bodyData, suffixData);
  }
  return concatUInt8Array(prefixData, requestInfoData, suffixData);
};

export type DecodedResponseV4 = {
  metadata: {
    code: number;
    headers?: Record<string, string>;
  };
  body: any; // might be object, or binary or maybe some other stuff..
  bodyContentType: string;
};

/**
 * When we do a batch request, we get a list of bodies in the body of the response. This is the type for those bodies
 */
export type DecodedResponseBodiesV4 = Array<any>;

/**
 * Nearly identical to request encoding. 2 string bencoded list.
 * Response differs in that the second body part is always present in a response unlike the requests.
 * 1. First part contains response metadata
 * 2. Second part contains the request body.
 */
export const decodeV4Response = (response: string): DecodedResponseV4 | undefined => {
  // json part will have code: containing response code and headers for http headers (always lower case)
  // 1. read first bit till colon to get the length. Substring the next X amount trailing the colon and that's the metadata.
  // 2. grab the number before the next colon. That's the expected length of the body.
  // 3. Use the content type from the metadata header to handle the body.
  // console.error('decodeV4Response', response);
  if (!(response.startsWith('l') && response.endsWith('e'))) {
    window?.log?.error(
      'Batch response is missing prefix and suffix characters - Dropping response'
    );
    return;
  }

  try {
    const firstDelimitIdx = response.indexOf(':');
    const metaLength = toNumber(response.slice(1, firstDelimitIdx));

    const metaStartIndex = firstDelimitIdx + 1;
    const metaEndIndex = metaStartIndex + metaLength;
    const metadata = JSON.parse(response.slice(metaStartIndex, metaEndIndex));

    const beforeBodyIndex = response.indexOf(':', metaEndIndex);
    const bodyLength = toNumber(response.slice(metaEndIndex, beforeBodyIndex));
    const bodyText = response.slice(beforeBodyIndex + 1, beforeBodyIndex + (bodyLength + 1));

    const bodyContentType: string = metadata?.headers['content-type'];
    let bodyParsed: object | null = null;
    switch (bodyContentType) {
      // TODO; add cases for other data types
      case 'application/json':
        bodyParsed = JSON.parse(bodyText);
        break;
      case 'text/plain; charset=utf-8':
        bodyParsed = { plainText: bodyText };
        break;
      default:
        window?.log?.warn(
          'decodeV4Response - No or unknown content-type information for response: ',
          bodyContentType
        );
    }

    return {
      metadata,
      body: bodyParsed,
      bodyContentType,
    };
  } catch (e) {
    window.log.warn('failed to decodeV4Response:', e.message);
    return undefined;
  }
};
