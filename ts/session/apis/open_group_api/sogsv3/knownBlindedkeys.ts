import { from_hex, to_hex } from 'libsodium-wrappers-sumo';
import { cloneDeep, isEqual } from 'lodash';
import { getConversationController } from '../../../conversations';
import { LibSodiumWrappers } from '../../../crypto';
import { KeyPrefixType, PubKey } from '../../../types';
import { crypto_sign_curve25519_pk_to_ed25519 } from 'curve25519-js';

export type BlindedIdMapping = {
  blindedId: string;
  serverPublicKey: string;
  realSessionId: string;
};

const cachedKnownMapping: Array<BlindedIdMapping> = [];

export function isNonBlindedKey(blindedId: string) {
  if (
    blindedId.startsWith(KeyPrefixType.unblinded || blindedId.startsWith(KeyPrefixType.standard))
  ) {
    return true;
  }
  return false;
}

export function getCachedBlindedKeyMapping(
  blindedId: string,
  serverPublicKey: string
): string | undefined {
  if (isNonBlindedKey(blindedId)) {
    return blindedId;
  }
  const found = cachedKnownMapping.find(
    m => m.serverPublicKey === serverPublicKey && m.blindedId === blindedId
  );
  return found?.realSessionId || undefined;
}

export function addCachedBlindedKey({
  blindedId,
  serverPublicKey,
  realSessionId,
}: BlindedIdMapping) {
  if (isNonBlindedKey(blindedId)) {
    throw new Error('blindedId is not a blinded key');
  }
  if (isNonBlindedKey(realSessionId)) {
    throw new Error('realSessionId must not be blinded');
  }
  const foundIndex = cachedKnownMapping.findIndex(
    m => m.blindedId === blindedId && serverPublicKey === m.serverPublicKey
  );
  if (foundIndex > 0) {
    if (cachedKnownMapping[foundIndex].realSessionId !== realSessionId) {
      window.log.warn(
        `overriding cached blinded mapping for ${cachedKnownMapping[foundIndex].realSessionId} with ${realSessionId} on ${serverPublicKey}`
      );
      cachedKnownMapping[foundIndex].realSessionId = realSessionId;
    }
    return;
  }
  console.warn(
    `found matching real id ${realSessionId} for server ${serverPublicKey} and blindedId: ${blindedId}`
  );
  cachedKnownMapping.push({ blindedId, serverPublicKey, realSessionId });
}

function generateBlindingFactor(serverPk: string, sodium: LibSodiumWrappers) {
  const hexServerPk = from_hex(serverPk);
  const serverPkHash = sodium.crypto_generichash(64, hexServerPk);
  if (!serverPkHash.length) {
    throw new Error('generateBlindingFactor: crypto_generichash failed');
  }

  // Reduce the server public key into an ed25519 scalar (`k`)
  const k = sodium.crypto_core_ed25519_scalar_reduce(serverPkHash);

  return k;
}

function combineKeys(lhsKeyBytes: Uint8Array, rhsKeyBytes: Uint8Array, sodium: LibSodiumWrappers) {
  return sodium.crypto_scalarmult_ed25519_noclamp(lhsKeyBytes, rhsKeyBytes);
}

function tryMatchBlindWithStandardKey(
  standardSessionId: string,
  blindedSessionId: string,
  serverPubKey: string,
  sodium: LibSodiumWrappers
): { pk1: string; pk2: string } | null {
  if (!standardSessionId.startsWith(KeyPrefixType.standard)) {
    throw new Error('standardKey must be a standard key (starting with 05)');
  }

  if (!blindedSessionId.startsWith(KeyPrefixType.blinded)) {
    throw new Error('blindedKey must be a blinded key (starting with 15)');
  }
  // tslint:disable: no-bitwise

  const sessionIdNoPrefix = PubKey.removePrefixIfNeeded(PubKey.cast(standardSessionId).key);
  const blindedIdNoPrefix = PubKey.removePrefixIfNeeded(PubKey.cast(blindedSessionId).key);
  const kBytes = generateBlindingFactor(serverPubKey, sodium);

  // From the session id (ignoring 05 prefix) we have two possible ed25519 pubkeys; the first is
  // the positive(which is what Signal's XEd25519 conversion always uses):

  const inbin = from_hex(sessionIdNoPrefix);
  // Note: The below method is code we have exposed from the  method within the Curve25519-js library
  // rather than custom code we have written
  const xEd25519Key = crypto_sign_curve25519_pk_to_ed25519(inbin);

  // Blind it:
  const pk1 = combineKeys(kBytes, xEd25519Key, sodium);
  //  For the negative, what we're going to get out of the above is simply the negative of pk1, so
  // flip the sign bit to get pk2:
  const pk2 = cloneDeep(pk1);
  pk2[31] = pk1[31] ^ 0b1000_0000;

  const match = isEqual(blindedIdNoPrefix, to_hex(pk1)) || isEqual(blindedIdNoPrefix, to_hex(pk2));
  console.warn(`Got a match? ${match} `);

  if (!match) {
    return null;
  }

  return { pk1: to_hex(pk1), pk2: to_hex(pk2) };
}

/**
 * This function can be called to trigger a build of the cache.
 * This function is expensive depending on the contacts list length of the user
 * We only consider the private & approved conversations for mapping.
 */
function findNotCachedBlindingMatch(
  blindedId: string,
  serverPublicKey: string,
  sodium: LibSodiumWrappers
): string | undefined {
  if (isNonBlindedKey(blindedId)) {
    throw new Error('findNotCachedBlindingMatch blindedId is supposed to be blinded');
  }

  // we iterate only over the convos private, approved, and which have an unblinded id.
  const foundConvoMatchingBlindedPubkey = getConversationController()
    .getConversations()
    .filter(m => m.isPrivate() && m.isApproved() && !PubKey.hasBlindedPrefix(m.id))
    .find(m => {
      return tryMatchBlindWithStandardKey(m.id, blindedId, serverPublicKey, sodium);
    });

  return foundConvoMatchingBlindedPubkey?.get('id') || undefined;
}

export function findCachedBlindedMatchOrItLookup(
  blindedId: string,
  serverPubKey: string,
  sodium: LibSodiumWrappers
): string | undefined {
  if (!PubKey.hasBlindedPrefix(blindedId)) {
    return blindedId;
  }
  const found = getCachedBlindedKeyMapping(blindedId, serverPubKey);

  if (found) {
    return found;
  }

  const realSessionIdFound = findNotCachedBlindingMatch(blindedId, serverPubKey, sodium);

  if (realSessionIdFound) {
    addCachedBlindedKey({
      blindedId,
      realSessionId: realSessionIdFound,
      serverPublicKey: serverPubKey,
    });
    return realSessionIdFound;
  }
  return undefined;
}
