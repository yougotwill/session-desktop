import { from_string } from 'libsodium-wrappers-sumo';
import { toNumber } from 'lodash';
import { concatUInt8Array } from '../crypto';

export const encodeV4Request = (requestInfo: { body?: any }): Uint8Array => {
  // for reference
  //   {
  //     "method": "POST",
  //     "body": "[{\"method\":\"GET\",\"path\":\"/capabilities\"},{\"method\":\"GET\",\"path\":\"/room/omg/messages/recent?limit=25\"}]",
  //     "endpoint": "/batch",
  //     "headers": {
  //         "X-SOGS-Pubkey": "0020be78d4c4755e6595cb240f404bc245138e27d6f06b9f6d47e7328af3d6d95d",
  //         "X-SOGS-Timestamp": "1649595222",
  //         "X-SOGS-Nonce": "5AJvZK87oSoPoiuFQKy7xA==",
  //         "X-SOGS-Signature": "z6DEbF83e3VrYk+gozizZT6Wb2Lp2QPscUq2V2MdFO+ZV8dsdM5wCeAxNCHgpqdTs160Boj9ygYjxhQLe6ERAA==",
  //         "Content-Type": "application/json"
  //     }
  // }

  // TODO: we need to remove the leading forward slash for non-legacy endpoints.
  // legacy needs the leading slash.
  // requestInfo.endpoint =
  //   requestInfo.endpoint.charAt(0) === '/' ? requestInfo.endpoint.substr(1) : requestInfo.endpoint;
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

export type ResponseDecodedV4 = {
  metadata: {
    code: number;
    headers: any;
  };
  body: any;
  bodyContentType: string;
};

/**
 * Nearly identical to request encoding. 2 string bencoded list.
 * Response differs in that the second body part is always present in a response unlike the requests.
 * 1. First part contains response metadata
 * 2. Second part contains the request body.
 */
export const decodeV4Response = (response: string): ResponseDecodedV4 | undefined => {
  // json part will have code: containing response code and headers for http headers (always lower case)
  // 1. read first bit till colon to get the length. Substring the next X amount trailing the colon and that's the metadata.
  // 2. grab the number before the next colon. That's the expected length of the body.
  // 3. Use the content type from the metadata header to handle the body.
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
    let bodyParsed;
    switch (bodyContentType) {
      // TODO; add cases for other data types
      case 'application/json':
        bodyParsed = JSON.parse(bodyText);
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
