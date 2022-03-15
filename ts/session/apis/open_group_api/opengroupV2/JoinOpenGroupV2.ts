import { to_base64 } from 'libsodium-wrappers-sumo';
import _ from 'lodash';
import { getV2OpenGroupRoomByRoomId, OpenGroupV2Room } from '../../../../data/opengroups';
import { sessionGenerateKeyPair, SessionKeyPair } from '../../../../util/accountManager';
import { getConversationController } from '../../../conversations';
import { concatUInt8Array, getSodium, sha512Multipart } from '../../../crypto';
import { PromiseUtils, StringUtils, ToastUtils } from '../../../utils';
import { fromHex, fromHexToArray, fromUInt8ArrayToBase64, toHex } from '../../../utils/String';
import { forceSyncConfigurationNowIfNeeded } from '../../../utils/syncUtils';
import {
  getOpenGroupV2ConversationId,
  openGroupV2CompleteURLRegex,
  prefixify,
  publicKeyParam,
} from '../utils/OpenGroupUtils';
import { getOpenGroupManager } from './OpenGroupManagerV2';

// Inputs that should work:
// https://sessionopengroup.co/main?public_key=658d29b91892a2389505596b135e76a53db6e11d613a51dbd3d0816adffb231c
// http://sessionopengroup.co/main?public_key=658d29b91892a2389505596b135e76a53db6e11d613a51dbd3d0816adffb231c
// sessionopengroup.co/main?public_key=658d29b91892a2389505596b135e76a53db6e11d613a51dbd3d0816adffb231c (does NOT go to HTTPS)
// https://143.198.213.225:443/main?public_key=658d29b91892a2389505596b135e76a53db6e11d613a51dbd3d0816adffb231c
// 143.198.213.255:80/main?public_key=658d29b91892a2389505596b135e76a53db6e11d613a51dbd3d0816adffb231c

export function parseOpenGroupV2(urlWithPubkey: string): OpenGroupV2Room | undefined {
  const lowerCased = urlWithPubkey.trim().toLowerCase();
  try {
    if (!openGroupV2CompleteURLRegex.test(lowerCased)) {
      throw new Error('regex fail');
    }

    // prefix the URL if it does not have a prefix
    const prefixedUrl = prefixify(lowerCased);
    // new URL fails if the protocol is not explicit
    const url = new URL(prefixedUrl);

    // the port (if any is set) is already in the url.host so no need to += url.port
    const serverUrl = `${url.protocol}//${url.host}`;

    const room: OpenGroupV2Room = {
      serverUrl,
      roomId: url.pathname.slice(1), // remove first '/'
      serverPublicKey: url.search.slice(publicKeyParam.length + 1), // remove the '?' and the 'public_key=' header
    };
    return room;
  } catch (e) {
    window?.log?.error('Invalid Opengroup v2 join URL:', lowerCased, e);
  }
  return undefined;
}

/**
 * Join an open group using the v2 logic.
 *
 * If you only have an string with all details in it, use parseOpenGroupV2() to extract and check the URL is valid
 *
 * @param server The server URL to join, defaults to https if protocol is not set
 * @param room The room id to join
 * @param publicKey The server publicKey. It comes from the joining link. (or is already here for the default open group server)
 */
async function joinOpenGroupV2(room: OpenGroupV2Room, fromConfigMessage: boolean): Promise<void> {
  if (!room.serverUrl || !room.roomId || room.roomId.length < 2 || !room.serverPublicKey) {
    return;
  }

  const serverUrl = room.serverUrl.toLowerCase();
  const roomId = room.roomId.toLowerCase();
  const publicKey = room.serverPublicKey.toLowerCase();
  const prefixedServer = prefixify(serverUrl);

  const alreadyExist = await getV2OpenGroupRoomByRoomId({ serverUrl, roomId });
  const conversationId = getOpenGroupV2ConversationId(serverUrl, roomId);
  const existingConvo = getConversationController().get(conversationId);

  if (alreadyExist && existingConvo) {
    window?.log?.warn('Skipping join opengroupv2: already exists');
    return;
  } else if (existingConvo) {
    // we already have a convo associated with it. Remove everything related to it so we start fresh
    window?.log?.warn('leaving before rejoining open group v2 room', conversationId);
    await getConversationController().deleteContact(conversationId);
  }

  // Try to connect to server
  try {
    const conversation = await PromiseUtils.timeout(
      getOpenGroupManager().attemptConnectionV2OneAtATime(prefixedServer, roomId, publicKey),
      20000
    );

    if (!conversation) {
      window?.log?.warn('Failed to join open group v2');
      throw new Error(window.i18n('connectToServerFail'));
    }

    // TODO: id-blinding maybe generate the key for the group here.
    // const keypair = createOpenGroupKeyPairWithPrefix(room, true); // todo: get blinding capabilities from endpoint
    // console.warn({ keypair });

    // here we managed to connect to the group.
    // if this is not a Sync Message, we should trigger one
    if (!fromConfigMessage) {
      await forceSyncConfigurationNowIfNeeded();
    }
  } catch (e) {
    window?.log?.error('Could not join open group v2', e.message);
    throw e;
  }
}

type OpenGroupKeyPair = {
  /**
   * The blinded public key of this device to send to open groups
   */
  publicKey: string;
  /**
   * The corresponding private key to be used with this public key
   */
  secretKey: string;
};

export async function getSigningHeaders() {
  // hardcoding test values
  const signingKeys = await sessionGenerateKeyPair(
    fromHex('c010d89eccbaf5d1c6d19df766c6eedf965d4a28a56f87c9fc819edb59896dd9')
  );
  const serverPubkey = fromHexToArray(
    'c3b3c6f32f0ab5a57f853cc4f30f5da7fda5624b0c77b3fb0829de562ada081d'
  );
  const nonce = fromHexToArray('09d0799f2295990182c3ab3406fbfc5b');
  const timestamp = 1642472103;
  const method = 'GET';
  const path = '/room/the-best-room/messages/recent?limit=25';

  // BLINDED PROCESS
  const { publicKeyBytes, secretKeyBytes } = await createOpenGroupKeyPairBytes(
    serverPubkey,
    signingKeys,
    true
  );

  const { publicKey: blindedPK, secretKey: blindedSK } = await createOpenGroupKeyPairWithPrefix(
    secretKeyBytes,
    publicKeyBytes,
    true
  );
  console.warn({ blindedPK, blindedSK });

  const blindedHeaders = await createSignatureForOpenGroup(
    signingKeys,
    serverPubkey,
    true,
    method,
    path,
    timestamp,
    nonce,
    publicKeyBytes,
    secretKeyBytes
  );
  console.warn({ blindedHeaders });
  // BLINDED PROCESS END

  const unblindedHeaders = await createSignatureForOpenGroup(
    signingKeys,
    serverPubkey,
    false,
    method,
    path,
    timestamp,
    nonce,
    publicKeyBytes,
    secretKeyBytes
  );
  console.warn({ unblindedHeaders });

  console.warn({
    // blindedPKCompare:
    // unblindedPK === '00bac6e71efd7dfa4a83c98ed24f254ab2c267f9ccdb172a5280a0444ad24e89cc',
    unblindedPKCompare:
      blindedPK === '1598932d4bccbe595a8789d7eb1629cefc483a0eaddc7e20e8fe5c771efafd9af5',
    blindedSigCompare:
      'n4HK33v7gkcz/3pZuWvzmOlY+AbzbpEN1K12dtCc8Gw0m4iP5gUddGKKLEbmoWNhqJeY2S81Lm9uK2DBBN8aCg==' ===
      blindedHeaders['X-SOGS-Signature'],
    unblindedSigCompare:
      'xxLpXHbomAJMB9AtGMyqvBsXrdd2040y+Ol/IKzElWfKJa3EYZRv1GLO6CTLhrDFUwVQe8PPltyGs54Kd7O5Cg==' ===
      unblindedHeaders['X-SOGS-Signature'],
  });
}

/**
 * ka is private key, kA is public key.
 */
async function createOpenGroupKeyPairBytes(
  serverPubKey: Uint8Array,
  ourSigningKey: SessionKeyPair,
  blinded: boolean
): Promise<{
  secretKeyBytes: Uint8Array;
  publicKeyBytes: Uint8Array;
}> {
  const a = new Uint8Array(ourSigningKey.privKey);
  const A = new Uint8Array(ourSigningKey.pubKey);

  if (blinded) {
    // a priv, A pub
    const sodium = await getSodium();
    const { crypto_core_ed25519_scalar_reduce, crypto_generichash } = sodium;

    const k = crypto_core_ed25519_scalar_reduce(crypto_generichash(64, serverPubKey));

    const ka = sodium.crypto_core_ed25519_scalar_mul(k, a);
    const kA = sodium.crypto_scalarmult_ed25519_base_noclamp(ka);

    return {
      publicKeyBytes: kA,
      secretKeyBytes: ka,
    };
  } else {
    return {
      publicKeyBytes: A,
      secretKeyBytes: a,
    };
  }
}

async function createOpenGroupKeyPairWithPrefix(
  secretKeyBytes: Uint8Array,
  pubKeyBytes: Uint8Array,
  blinded: boolean
): Promise<OpenGroupKeyPair> {
  if (blinded) {
    return {
      publicKey: `15${toHex(pubKeyBytes)}`,
      secretKey: toHex(secretKeyBytes),
    };
  } else {
    return {
      publicKey: `00${toHex(pubKeyBytes)}`,
      secretKey: toHex(secretKeyBytes),
    };
  }
}

async function createSignatureForOpenGroup(
  ourKeyPair: SessionKeyPair,
  serverPubKey: Uint8Array,
  blinded: boolean,
  method: string,
  path: string,
  timestamp: number,
  nonce: Uint8Array,
  secretKeyBytes: Uint8Array,
  publicKeyBytes: Uint8Array
  // hbody?: string
) {
  const sodium = await getSodium();
  const utf8ToUint8 = (s: string) => new Uint8Array(StringUtils.encode(s, 'utf8'));
  const timestampBytes = utf8ToUint8(timestamp.toString()); // todo: probably has to be bytes

  let toSign = concatUInt8Array(
    serverPubKey,
    nonce,
    timestampBytes,
    utf8ToUint8(method),
    utf8ToUint8(path)
  );

  let msgParts = [serverPubKey, nonce, timestampBytes, utf8ToUint8(method), utf8ToUint8(path)];

  console.warn({ toSign2: msgParts, toSign });
  console.log(msgParts.length, toSign.length);

  let signature;
  if (blinded) {
    // todo: expose s, ka and KA for this
    signature = await blindedED25519Signature(msgParts, ourKeyPair, secretKeyBytes, publicKeyBytes);
  } else {
    // todo: replace with userUtils to get our key rather than from method params.
    const test = fromHexToArray(toHex(ourKeyPair.privKey));
    console.warn({ test });
    signature = sodium.crypto_sign_detached(toSign, new Uint8Array(ourKeyPair.privKey));
  }
  return {
    'X-SOGS-Pubkey': toHex(ourKeyPair.pubKey),
    'X-SOGS-Timestamp': timestamp,
    'X-SOGS-Nonce': fromUInt8ArrayToBase64(nonce).toString(),
    'X-SOGS-Signature': fromUInt8ArrayToBase64(signature),
  };
}

/**
 *
 * @param messageParts concatenated byte array
 * @param ourKeyPair our devices keypair
 * @param secretKeyBytes blinded secret key for this open group
 * @param publicKeyBytes blinded pubkey for this open group
 * @returns blinded signature
 */
async function blindedED25519Signature(
  messageParts: Array<Uint8Array>,
  ourKeyPair: SessionKeyPair,
  secretKeyBytes: Uint8Array,
  publicKeyBytes: Uint8Array
): Promise<Uint8Array> {
  const sodium = await getSodium();

  const H_rh = sodium.crypto_hash_sha512(new Uint8Array(ourKeyPair.privKey)).slice(32);
  const r = sodium.crypto_core_ed25519_scalar_reduce(
    sha512Multipart([H_rh, publicKeyBytes, ...messageParts])
  );

  const sigR = sodium.crypto_scalarmult_ed25519_base_noclamp(r);

  const HRAM = sodium.crypto_core_ed25519_scalar_reduce(
    sha512Multipart([sigR, publicKeyBytes, ...messageParts])
  );

  const sig_s = sodium.crypto_core_ed25519_scalar_add(
    r,
    sodium.crypto_core_ed25519_scalar_mul(HRAM, secretKeyBytes)
  );

  const full_sig = new Uint8Array([...sigR, ...sig_s]);
  const base64Sig = to_base64(full_sig);
  console.warn({ base64Sig });
  const expectedSig =
    'n4HK33v7gkcz/3pZuWvzmOlY+AbzbpEN1K12dtCc8Gw0m4iP5gUddGKKLEbmoWNhqJeY2S81Lm9uK2DBBN8aCg==';
  console.warn({ expectedSig });
  console.warn('match: ', base64Sig === expectedSig);
  return full_sig;
}

/**
 * This function does not throw
 * This function can be used to join an opengroupv2 server, from a user initiated click or from a syncMessage.
 * If the user made the request, the UI callback needs to be set.
 * the callback will be called on loading events (start and stop joining). Also, this callback being set defines if we will trigger a sync message or not.
 *
 * Basically,
 *  - user invitation click => uicallback set
 *  - user join manually from the join open group field => uicallback set
 *  - joining from a sync message => no uicallback
 *
 *
 * return true if the room did not exist before, and we join it correctly
 */
export async function joinOpenGroupV2WithUIEvents(
  completeUrl: string,
  showToasts: boolean,
  fromConfigMessage: boolean,
  uiCallback?: (loading: boolean) => void
): Promise<boolean> {
  try {
    const parsedRoom = parseOpenGroupV2(completeUrl);
    if (!parsedRoom) {
      if (showToasts) {
        ToastUtils.pushToastError('connectToServer', window.i18n('invalidOpenGroupUrl'));
      }
      return false;
    }
    const conversationID = getOpenGroupV2ConversationId(parsedRoom.serverUrl, parsedRoom.roomId);
    if (getConversationController().get(conversationID)) {
      if (showToasts) {
        ToastUtils.pushToastError('publicChatExists', window.i18n('publicChatExists'));
      }
      return false;
    }
    if (showToasts) {
      ToastUtils.pushToastInfo('connectingToServer', window.i18n('connectingToServer'));
    }
    if (uiCallback) {
      uiCallback(true);
    }
    await joinOpenGroupV2(parsedRoom, fromConfigMessage);

    const isConvoCreated = getConversationController().get(conversationID);
    if (isConvoCreated) {
      if (showToasts) {
        ToastUtils.pushToastSuccess(
          'connectToServerSuccess',
          window.i18n('connectToServerSuccess')
        );
      }
      return true;
    } else {
      if (showToasts) {
        ToastUtils.pushToastError('connectToServerFail', window.i18n('connectToServerFail'));
      }
    }
  } catch (error) {
    window?.log?.warn('got error while joining open group:', error.message);
    if (showToasts) {
      ToastUtils.pushToastError('connectToServerFail', window.i18n('connectToServerFail'));
    }
  } finally {
    if (uiCallback) {
      uiCallback(false);
    }
  }
  return false;
}
