/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
import { GroupPubkeyType, PubkeyType } from 'libsession_util_nodejs';
import { compact, isEmpty } from 'lodash';
import pRetry from 'p-retry';
import { getSodiumRenderer } from '../../crypto';
import { ed25519Str } from '../../onions/onionPath';
import { PubKey } from '../../types';
import { StringUtils, UserUtils } from '../../utils';
import { fromBase64ToArray, fromHexToArray } from '../../utils/String';
import {
  DeleteAllFromUserNodeSubRequest,
  DeleteHashesFromGroupNodeSubRequest,
  DeleteHashesFromUserNodeSubRequest,
} from './SnodeRequestTypes';
import { BatchRequests } from './batchRequest';
import { SnodePool } from './snodePool';

export const ERROR_CODE_NO_CONNECT = 'ENETUNREACH: No network connection.';

// TODOLATER we should merge those two functions together as they are almost exactly the same
const forceNetworkDeletion = async (): Promise<Array<string> | null> => {
  const sodium = await getSodiumRenderer();
  const usPk = UserUtils.getOurPubKeyStrFromCache();

  const request = new DeleteAllFromUserNodeSubRequest();

  try {
    const maliciousSnodes = await pRetry(
      async () => {
        const snodeToMakeRequestTo = await SnodePool.getNodeFromSwarmOrThrow(usPk);
        const builtRequest = await request.buildAndSignParameters(); // we need the timestamp to verify the signature below
        return pRetry(
          async () => {
            const ret = await BatchRequests.doSnodeBatchRequestNoRetries(
              [builtRequest],
              snodeToMakeRequestTo,
              10000,
              usPk,
              false
            );

            if (!ret || !ret?.[0].body || ret[0].code !== 200) {
              throw new Error(
                `Empty response got for ${request.method} on snode ${ed25519Str(
                  snodeToMakeRequestTo.pubkey_ed25519
                )}`
              );
            }

            try {
              const firstResultParsedBody = ret[0].body;
              const { swarm } = firstResultParsedBody;

              if (!swarm) {
                throw new Error(
                  `Invalid JSON swarm response got for ${request.method} on snode ${ed25519Str(
                    snodeToMakeRequestTo.pubkey_ed25519
                  )}, ${firstResultParsedBody}`
                );
              }
              const swarmAsArray = Object.entries(swarm) as Array<Array<any>>;
              if (!swarmAsArray.length) {
                throw new Error(
                  `Invalid JSON swarmAsArray response got for ${request.method} on snode ${ed25519Str(
                    snodeToMakeRequestTo.pubkey_ed25519
                  )}, ${firstResultParsedBody}`
                );
              }
              // results will only contains the snode pubkeys which returned invalid/empty results
              const results: Array<string> = compact(
                swarmAsArray.map(snode => {
                  const snodePubkey = snode[0];
                  const snodeJson = snode[1];

                  const isFailed = snodeJson.failed || false;

                  if (isFailed) {
                    const reason = snodeJson.reason;
                    const statusCode = snodeJson.code;
                    if (reason && statusCode) {
                      window?.log?.warn(
                        `Could not ${request.method} from ${ed25519Str(
                          snodeToMakeRequestTo.pubkey_ed25519
                        )} due to error: ${reason}: ${statusCode}`
                      );
                      // if we tried to make the delete on a snode not in our swarm, just trigger a pRetry error so the outer block here finds new snodes to make the request to.
                      if (statusCode === 421) {
                        throw new pRetry.AbortError(
                          `421 error on network ${request.method}. Retrying with a new snode`
                        );
                      }
                    } else {
                      window?.log?.warn(
                        `Could not ${request.method} from ${ed25519Str(
                          snodeToMakeRequestTo.pubkey_ed25519
                        )}`
                      );
                    }
                    return snodePubkey;
                  }

                  const deletedObj = snodeJson.deleted as Record<number, Array<string>>;
                  const hashes: Array<string> = [];

                  for (const key in deletedObj) {
                    if (deletedObj.hasOwnProperty(key)) {
                      hashes.push(...deletedObj[key]);
                    }
                  }
                  const sortedHashes = hashes.sort();
                  const signatureSnode = snodeJson.signature as string;
                  // The signature format is (with sortedHashes accross all namespaces) ( PUBKEY_HEX || TIMESTAMP || DELETEDHASH[0] || ... || DELETEDHASH[N] )
                  const dataToVerify = `${usPk}${builtRequest.params.timestamp}${sortedHashes.join('')}`;

                  const dataToVerifyUtf8 = StringUtils.encode(dataToVerify, 'utf8');
                  const isValid = sodium.crypto_sign_verify_detached(
                    fromBase64ToArray(signatureSnode),
                    new Uint8Array(dataToVerifyUtf8),
                    fromHexToArray(snodePubkey)
                  );
                  if (!isValid) {
                    return snodePubkey;
                  }
                  return null;
                })
              );

              return results;
            } catch (e) {
              throw new Error(
                `Invalid JSON response got for ${request.method} on snode ${ed25519Str(
                  snodeToMakeRequestTo.pubkey_ed25519
                )}, ${ret}`
              );
            }
          },
          {
            retries: 3,
            minTimeout: SnodeAPI.TEST_getMinTimeout(),
            onFailedAttempt: e => {
              window?.log?.warn(
                `${request.method} INNER request attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left...`
              );
            },
          }
        );
      },
      {
        retries: 3,
        minTimeout: SnodeAPI.TEST_getMinTimeout(),
        onFailedAttempt: e => {
          window?.log?.warn(
            `${request.method} OUTER request attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left... ${e.message}`
          );
        },
      }
    );

    return maliciousSnodes;
  } catch (e) {
    window?.log?.warn(`failed to ${request.method} everything on network:`, e);
    return null;
  }
};

const TEST_getMinTimeout = () => 500;

/**
 * Locally deletes message and deletes message on the network (all nodes that contain the message)
 */
const networkDeleteMessages = async (
  messagesHashes: Array<string>,
  pubkey: PubkeyType | GroupPubkeyType
): Promise<boolean> => {
  const sodium = await getSodiumRenderer();
  if (PubKey.is05Pubkey(pubkey) && pubkey !== UserUtils.getOurPubKeyStrFromCache()) {
    throw new Error('networkDeleteMessages with 05 pk can only delete for ourself');
  }
  const request = PubKey.is03Pubkey(pubkey)
    ? new DeleteHashesFromGroupNodeSubRequest({ messagesHashes, groupPk: pubkey })
    : new DeleteHashesFromUserNodeSubRequest({ messagesHashes });

  try {
    const success = await pRetry(
      async () => {
        const snodeToMakeRequestTo = await SnodePool.getNodeFromSwarmOrThrow(request.pubkey);

        return pRetry(
          async () => {
            const ret = await BatchRequests.doUnsignedSnodeBatchRequestNoRetries(
              [request],
              snodeToMakeRequestTo,
              10000,
              request.pubkey,
              false
            );
            debugger;

            if (!ret || !ret?.[0].body || ret[0].code !== 200) {
              throw new Error(
                `Empty response got for ${request.method} on snode ${ed25519Str(
                  snodeToMakeRequestTo.pubkey_ed25519
                )} about pk: ${ed25519Str(request.pubkey)}`
              );
            }

            try {
              const firstResultParsedBody = ret[0].body;
              const { swarm } = firstResultParsedBody;

              if (!swarm) {
                throw new Error(
                  `Invalid JSON swarm response got for ${request.method} on snode ${ed25519Str(
                    snodeToMakeRequestTo.pubkey_ed25519
                  )}, ${firstResultParsedBody}`
                );
              }
              const swarmAsArray = Object.entries(swarm) as Array<Array<any>>;
              if (!swarmAsArray.length) {
                throw new Error(
                  `Invalid JSON swarmAsArray response got for ${request.method} on snode ${ed25519Str(
                    snodeToMakeRequestTo.pubkey_ed25519
                  )}, ${firstResultParsedBody}`
                );
              }
              // results will only contains the snode pubkeys which returned invalid/empty results
              const results: Array<string> = compact(
                swarmAsArray.map(snode => {
                  const snodePubkey = snode[0];
                  const snodeJson = snode[1];

                  const isFailed = snodeJson.failed || false;

                  if (isFailed) {
                    const reason = snodeJson.reason;
                    const statusCode = snodeJson.code;
                    if (reason && statusCode) {
                      window?.log?.warn(
                        `Could not ${request.method} from ${ed25519Str(
                          snodeToMakeRequestTo.pubkey_ed25519
                        )} due to error: ${reason}: ${statusCode}`
                      );
                      // if we tried to make the delete on a snode not in our swarm, just trigger a pRetry error so the outer block here finds new snodes to make the request to.
                      if (statusCode === 421) {
                        throw new pRetry.AbortError(
                          `421 error on network ${request.method}. Retrying with a new snode`
                        );
                      }
                    } else {
                      window?.log?.warn(
                        `Could not ${request.method} from ${ed25519Str(
                          snodeToMakeRequestTo.pubkey_ed25519
                        )}`
                      );
                    }
                    return snodePubkey;
                  }

                  const responseHashes = snodeJson.deleted as Array<string>;
                  const signatureSnode = snodeJson.signature as string;
                  // The signature looks like ( PUBKEY_HEX || RMSG[0] || ... || RMSG[N] || DMSG[0] || ... || DMSG[M] )
                  const dataToVerify = `${request.pubkey}${messagesHashes.join(
                    ''
                  )}${responseHashes.join('')}`;
                  const dataToVerifyUtf8 = StringUtils.encode(dataToVerify, 'utf8');
                  const isValid = sodium.crypto_sign_verify_detached(
                    fromBase64ToArray(signatureSnode),
                    new Uint8Array(dataToVerifyUtf8),
                    fromHexToArray(snodePubkey)
                  );
                  if (!isValid) {
                    return snodePubkey;
                  }
                  return null;
                })
              );

              return isEmpty(results);
            } catch (e) {
              throw new Error(
                `Invalid JSON response got for ${request.method} on snode ${ed25519Str(
                  snodeToMakeRequestTo.pubkey_ed25519
                )}, ${ret}`
              );
            }
          },
          {
            retries: 3,
            minTimeout: SnodeAPI.TEST_getMinTimeout(),
            onFailedAttempt: e => {
              window?.log?.warn(
                `${request.method} INNER request attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left...`
              );
            },
          }
        );
      },
      {
        retries: 3,
        minTimeout: SnodeAPI.TEST_getMinTimeout(),
        onFailedAttempt: e => {
          window?.log?.warn(
            `${request.method} OUTER request attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left... ${e.message}`
          );
        },
      }
    );

    return success;
  } catch (e) {
    window?.log?.warn(`failed to ${request.method} message on network:`, e);
    return false;
  }
};

export const SnodeAPI = {
  TEST_getMinTimeout,
  networkDeleteMessages,
  forceNetworkDeletion,
};
