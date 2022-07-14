import { from_hex, to_hex } from 'libsodium-wrappers-sumo';
import { cloneDeep, flatten, isEmpty, isEqual, isString, uniqBy } from 'lodash';
import { getConversationController } from '../../../conversations';
import { LibSodiumWrappers } from '../../../crypto';
import { KeyPrefixType, PubKey } from '../../../types';
import { crypto_sign_curve25519_pk_to_ed25519 } from 'curve25519-js';
import { createOrUpdateItem, getItemById } from '../../../../data/channelsItem';
import { combineKeys, generateBlindingFactor } from '../../../utils/SodiumUtils';
import { getAllOpengroupsServerPubkeys, getV2OpenGroupRoom } from '../../../../data/opengroups';
import { ConversationModel } from '../../../../models/conversation';
import { UserUtils } from '../../../utils';
import { getBlindedPubKey } from './sogsBlinding';
import { fromHexToArray } from '../../../utils/String';
import { roomHasBlindEnabled } from './sogsV3Capabilities';

export type BlindedIdMapping = {
  blindedId: string;
  serverPublicKey: string;
  realSessionId: string;
};

const KNOWN_BLINDED_KEYS_ITEM = 'KNOWN_BLINDED_KEYS_ITEM';

// for now, we assume we won't find a lot of blinded keys.
// So we can store all of those in a single JSON string in the db.
let cachedKnownMapping: Array<BlindedIdMapping> | null = null;

export async function loadKnownBlindedKeys() {
  if (cachedKnownMapping !== null) {
    throw new Error('loadKnownBlindedKeys must only be called once');
  }
  const fromDb = await getItemById(KNOWN_BLINDED_KEYS_ITEM);
  if (fromDb && fromDb.value && !isEmpty(fromDb.value)) {
    try {
      const read = JSON.parse(fromDb.value);
      cachedKnownMapping = cachedKnownMapping || [];
      read.forEach((elem: any) => {
        cachedKnownMapping?.push(elem);
      });
    } catch (e) {
      window.log.error(e.message);
      cachedKnownMapping = [];
    }
  } else {
    cachedKnownMapping = [];
  }
}

async function writeKnownBlindedKeys() {
  if (cachedKnownMapping && cachedKnownMapping.length) {
    await createOrUpdateItem({
      id: KNOWN_BLINDED_KEYS_ITEM,
      value: JSON.stringify(cachedKnownMapping),
    });
  }
}

function assertLoaded(): Array<BlindedIdMapping> {
  if (cachedKnownMapping === null) {
    throw new Error('loadKnownBlindedKeys must be called on app start');
  }
  return cachedKnownMapping;
}

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
  const found = assertLoaded().find(
    m => m.serverPublicKey === serverPublicKey && m.blindedId === blindedId
  );
  return found?.realSessionId || undefined;
}

function getCachedUnblindedKeyMapping(
  unblindedId: string,
  serverPublicKey: string
): string | undefined {
  if (PubKey.hasBlindedPrefix(unblindedId)) {
    throw new Error('getCachedUnblindedKeyMapping needs an unblindedID');
  }
  const found = assertLoaded().find(
    m => m.serverPublicKey === serverPublicKey && m.realSessionId === unblindedId
  );
  return found?.blindedId || undefined;
}

function getCachedBlindedKeyMappingNoServerPubkey(blindedId: string): string | undefined {
  if (isNonBlindedKey(blindedId)) {
    return blindedId;
  }
  const found = assertLoaded().find(m => m.blindedId === blindedId);
  return found?.realSessionId || undefined;
}

export async function addCachedBlindedKey({
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
  const assertLoadedCache = assertLoaded();
  const foundIndex = assertLoadedCache.findIndex(
    m => m.blindedId === blindedId && serverPublicKey === m.serverPublicKey
  );
  if (foundIndex > 0) {
    if (assertLoadedCache[foundIndex].realSessionId !== realSessionId) {
      window.log.warn(
        `overriding cached blinded mapping for ${assertLoadedCache[foundIndex].realSessionId} with ${realSessionId} on ${serverPublicKey}`
      );
      assertLoadedCache[foundIndex].realSessionId = realSessionId;
      await writeKnownBlindedKeys();
    }

    return;
  }
  assertLoadedCache.push({ blindedId, serverPublicKey, realSessionId });
  await writeKnownBlindedKeys();
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

/**
 * This function returns true if the given blindedId matches our own blinded id on any pysogs.
 * If the given pubkey  is not blinded, it returns true if it is our naked SessionID.
 * It can be used to replace mentions with the @You syntax and for the quotes too
 */
export function isUsAnySogsFromCache(blindedOrNakedId: string): boolean {
  const usUnblinded = UserUtils.getOurPubKeyStrFromCache();

  if (!PubKey.hasBlindedPrefix(blindedOrNakedId)) {
    return blindedOrNakedId === usUnblinded;
  }
  const found = assertLoaded().find(
    m => m.blindedId === blindedOrNakedId && m.realSessionId === usUnblinded
  );
  return Boolean(found);
}

/**
 * This function returns the cached blindedId for us, given a public conversation.
 */
export function getUsBlindedInThatServer(convo: ConversationModel | string): string | undefined {
  if (!convo) {
    return undefined;
  }
  const room = getV2OpenGroupRoom(isString(convo) ? convo : convo.id);
  if (!room || !roomHasBlindEnabled(room) || !room.serverPublicKey) {
    return undefined;
  }
  const usNaked = UserUtils.getOurPubKeyStrFromCache();

  const found = assertLoaded().find(
    m => m.serverPublicKey === room.serverPublicKey && m.realSessionId === usNaked
  );
  return found?.blindedId;
}

/**
 * This function can be called to find all blinded conversations we have with a user given its real sessionID.
 * It should be used when we get a message request response, to merge all convos into one.
 *
 * This function is quite resource intensive, so do not call it everywhere
 */
function findNotCachedBlindedConvoFromUnblindedKey(
  unblindedID: string,
  serverPublicKey: string,
  sodium: LibSodiumWrappers
): Array<ConversationModel> {
  if (PubKey.hasBlindedPrefix(unblindedID)) {
    throw new Error(
      'findNotCachedBlindedConvoFromUnblindedKey unblindedID is supposed to be unblinded!'
    );
  }

  // we iterate only over the convos private, with a blindedId, and active,
  // so the one to which we sent a message already or received one from outside sogs.
  const foundConvosForThisServerPk =
    getConversationController()
      .getConversations()
      .filter(m => m.isPrivate() && PubKey.hasBlindedPrefix(m.id) && m.isActive())
      .filter(m => {
        return tryMatchBlindWithStandardKey(unblindedID, m.id, serverPublicKey, sodium);
      }) || [];

  // we should have only one per server, as we gave the serverpubkey and a blindedId is uniq for a serverPk

  return foundConvosForThisServerPk;
}

export async function findCachedBlindedMatchOrItLookup(
  blindedId: string,
  serverPubKey: string,
  sodium: LibSodiumWrappers
): Promise<string | undefined> {
  if (!PubKey.hasBlindedPrefix(blindedId)) {
    return blindedId;
  }
  const found = getCachedBlindedKeyMapping(blindedId, serverPubKey);

  if (found) {
    return found;
  }

  const realSessionIdFound = findNotCachedBlindingMatch(blindedId, serverPubKey, sodium);

  if (realSessionIdFound) {
    await addCachedBlindedKey({
      blindedId,
      realSessionId: realSessionIdFound,
      serverPublicKey: serverPubKey,
    });
    return realSessionIdFound;
  }
  return undefined;
}

/**
 * When we sent a message to a sogs with blinded enable, we need to store the message with the sender being our blinded pubkey.
 * We store that mapping <ourKey, serverPk, blindedKey> in the same cache, so we can map our own messages synced easily.
 * This function just find if there is such a mapping already cached, but won't try to update the cache to find one.
 */
export function findCachedBlindedIdFromUnblinded(
  unblindedId: string,
  serverPubKey: string
): string | undefined {
  if (PubKey.hasBlindedPrefix(unblindedId)) {
    throw new Error('findCachedBlindedIdFromUnblinded needs a unblindedID');
  }
  return getCachedUnblindedKeyMapping(unblindedId, serverPubKey);
}

/**
 * This function can be used to generate our blindedId for a sogs requiring it, and cache it.
 */
export async function findCachedOurBlindedPubkeyOrLookItUp(
  serverPubKey: string,
  sodium: LibSodiumWrappers
): Promise<string> {
  const ourNakedSessionID = UserUtils.getOurPubKeyStrFromCache();

  if (PubKey.hasBlindedPrefix(ourNakedSessionID)) {
    throw new Error('findCachedBlindedIdFromUnblindedOrLookItUp needs a unblindedID');
  }
  let found = findCachedBlindedIdFromUnblinded(ourNakedSessionID, serverPubKey);

  if (found) {
    return found;
  }
  const signingKeys = await UserUtils.getUserED25519KeyPairBytes();

  // just to make sure the mapping was not added during last line call

  if (!signingKeys) {
    throw new Error('addSingleOutgoingMessage: getUserED25519KeyPairBytes returned nothing');
  }

  const blindedPubkeyForThisSogs = getBlindedPubKey(
    fromHexToArray(serverPubKey),
    signingKeys,
    sodium
  );
  found = findCachedBlindedIdFromUnblinded(ourNakedSessionID, serverPubKey);

  if (found) {
    return found;
  }

  await addCachedBlindedKey({
    blindedId: blindedPubkeyForThisSogs,
    serverPublicKey: serverPubKey,
    realSessionId: ourNakedSessionID,
  });
  return blindedPubkeyForThisSogs;
}

export function findCachedBlindedMatchNoLookup(blindedId: string): string | undefined {
  if (!PubKey.hasBlindedPrefix(blindedId)) {
    return blindedId;
  }
  const found = getCachedBlindedKeyMappingNoServerPubkey(blindedId);

  return found || undefined;
}

/**
 * Can be used when we get an unblinded message to check if this is actually a reply to any of the conversation we were having with a blinded id, on any sogs
 * @param unblindedId the blindedId of that user
 * @param sodium passed so we can make this function not async
 */
export function findCachedBlindedMatchOrItLookupAllServers(
  unblindedId: string,
  sodium: LibSodiumWrappers
): Array<ConversationModel> {
  if (PubKey.hasBlindedPrefix(unblindedId)) {
    throw new Error('findCachedBlindedMatchOrItLookupAllServers needs an unblindedId');
  }

  const allServerPubkeys = getAllOpengroupsServerPubkeys();
  let matchingServerPubkeyWithThatBlindedId = flatten(
    allServerPubkeys.map(serverPk => {
      return findNotCachedBlindedConvoFromUnblindedKey(unblindedId, serverPk, sodium);
    })
  );
  matchingServerPubkeyWithThatBlindedId =
    uniqBy(matchingServerPubkeyWithThatBlindedId, m => m.id) || [];

  return matchingServerPubkeyWithThatBlindedId;
}
