import { crypto_hash_sha512, KeyPair, to_hex } from 'libsodium-wrappers-sumo';
import _ from 'lodash';
import { getV2OpenGroupRoomByRoomId, OpenGroupV2Room } from '../../../../data/opengroups';
import { sessionGenerateKeyPair } from '../../../../util/accountManager';
import { getConversationController } from '../../../conversations';
import { concatUInt8Array, getSodium } from '../../../crypto';
import { PromiseUtils, ToastUtils } from '../../../utils';
import {
  fromHex,
  fromHexToArray,
  fromUInt8ArrayToBase64,
  stringToUint8Array,
  toHex,
} from '../../../utils/String';
import { forceSyncConfigurationNowIfNeeded } from '../../../utils/syncUtils';
import {
  getOpenGroupV2ConversationId,
  openGroupV2CompleteURLRegex,
  prefixify,
  publicKeyParam,
} from '../utils/OpenGroupUtils';
import { getOpenGroupManager } from './OpenGroupManagerV2';
// tslint:disable: variable-name

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

const debugOutput = (key: string, headers: any, blinded: boolean) => {
  const common: Record<string, string> = {
    'X-SOGS-Timestamp': '1642472103',
    'X-SOGS-Nonce': 'CdB5nyKVmQGCw6s0Bvv8Ww==',
  };
  const testSet: Record<string, string> = blinded
    ? {
        ...common,
        'X-SOGS-Pubkey': '1598932d4bccbe595a8789d7eb1629cefc483a0eaddc7e20e8fe5c771efafd9af5',
        'X-SOGS-Signature':
          'gYqpWZX6fnF4Gb2xQM3xaXs0WIYEI49+B8q4mUUEg8Rw0ObaHUWfoWjMHMArAtP9QlORfiydsKWz1o6zdPVeCQ==', // old: n4HK33v7gkcz/3pZuWvzmOlY+AbzbpEN1K12dtCc8Gw0m4iP5gUddGKKLEbmoWNhqJeY2S81Lm9uK2DBBN8aCg==
      }
    : {
        ...common,
        'X-SOGS-Pubkey': '00bac6e71efd7dfa4a83c98ed24f254ab2c267f9ccdb172a5280a0444ad24e89cc',
        'X-SOGS-Signature':
          'xxLpXHbomAJMB9AtGMyqvBsXrdd2040y+Ol/IKzElWfKJa3EYZRv1GLO6CTLhrDFUwVQe8PPltyGs54Kd7O5Cg==',
      };

  const expected = testSet[key].toString();

  const output = headers[key];

  if (output === expected) {
    console.info(`%c ${key}`, 'background: green;');
    console.info({ output, expected });
    console.info('='.repeat(30));
  } else {
    console.info(`%c ${key}`, 'background: red;');
    console.info({ output, expected });
    console.info('='.repeat(30));
  }
};

export async function headerTest() {
  const signKeyHexUnused = 'c010d89eccbaf5d1c6d19df766c6eedf965d4a28a56f87c9fc819edb59896dd9';
  const signingKeys = await sessionGenerateKeyPair(fromHex(signKeyHexUnused));
  const ed52219KeyPair = signingKeys.ed25519KeyPair;

  console.warn('signingKeys pub: ', to_hex(ed52219KeyPair.publicKey));
  console.warn('signingKeys priv: ', to_hex(ed52219KeyPair.privateKey));

  const serverPK = fromHexToArray(
    'c3b3c6f32f0ab5a57f853cc4f30f5da7fda5624b0c77b3fb0829de562ada081d'
  );
  const nonce = fromHexToArray('09d0799f2295990182c3ab3406fbfc5b');
  const ts = 1642472103;
  const method = 'GET';
  const path = '/room/the-best-room/messages/recent?limit=25';

  console.info('blinded test', '#'.repeat(60));
  const blindedHeaders = await getSigningHeaders({
    signingKeys: ed52219KeyPair,
    serverPK,
    nonce,
    method,
    path,
    timestamp: ts,
    blinded: true,
  });
  console.warn({ blindedHeaders });
  debugOutput('X-SOGS-Pubkey', blindedHeaders, true);
  debugOutput('X-SOGS-Timestamp', blindedHeaders, true);
  debugOutput('X-SOGS-Nonce', blindedHeaders, true);
  debugOutput('X-SOGS-Signature', blindedHeaders, true);

  console.info('unblinded test', '#'.repeat(60));
  const unblindedHeaders = await getSigningHeaders({
    signingKeys: ed52219KeyPair,
    serverPK,
    nonce,
    method,
    path,
    timestamp: ts,
    blinded: false,
  });
  console.warn({ unblindedHeaders });
  debugOutput('X-SOGS-Pubkey', unblindedHeaders, false);
  debugOutput('X-SOGS-Timestamp', unblindedHeaders, false);
  debugOutput('X-SOGS-Nonce', unblindedHeaders, false);
  debugOutput('X-SOGS-Signature', unblindedHeaders, false);
}

async function getSigningHeaders(data: {
  signingKeys: KeyPair;
  serverPK: Uint8Array;
  nonce: Uint8Array;
  method: string;
  path: string;
  timestamp: number;
  blinded: boolean;
}) {
  const { signingKeys, serverPK, nonce, method, path, timestamp, blinded } = data;
  const sodium = await getSodium();
  let pubkey;

  let ka;
  let kA;
  if (blinded) {
    const k = sodium.crypto_core_ed25519_scalar_reduce(sodium.crypto_generichash(64, serverPK));

    // use curve key i.e. s.privKey
    let a = sodium.crypto_sign_ed25519_sk_to_curve25519(signingKeys.privateKey);

    if (a.length > 32) {
      console.warn('length of signing key is too loong, cutting to 32: oldlength', length);
      a = a.slice(0, 32);
    }

    // our blinded keypair
    ka = sodium.crypto_core_ed25519_scalar_mul(k, a); // had to cast for some reason

    kA = sodium.crypto_scalarmult_ed25519_base_noclamp(ka);

    pubkey = `15${toHex(kA)}`;
  } else {
    pubkey = `00${toHex(signingKeys.publicKey)}`;
  }

  const toSign = concatUInt8Array(
    serverPK,
    nonce,
    stringToUint8Array(timestamp.toString()),
    stringToUint8Array(method),
    stringToUint8Array(path)
  );
  let signature;
  if (blinded && ka && kA) {
    signature = await blindedED25519Signature(toSign, signingKeys, ka, kA);
  } else {
    signature = sodium.crypto_sign_detached(toSign, signingKeys.privateKey);
  }

  const headers = {
    'X-SOGS-Pubkey': pubkey,
    'X-SOGS-Timestamp': timestamp.toString(),
    'X-SOGS-Nonce': fromUInt8ArrayToBase64(nonce),
    'X-SOGS-Signature': fromUInt8ArrayToBase64(signature),
  };

  return headers;
}

/**
 *
 * @param messageParts concatenated byte array
 * @param ourKeyPair our devices keypair
 * @param ka blinded secret key for this open group
 * @param kA blinded pubkey for this open group
 * @returns blinded signature
 */
async function blindedED25519Signature(
  messageParts: Uint8Array,
  ourKeyPair: KeyPair,
  ka: Uint8Array,
  kA: Uint8Array
): Promise<Uint8Array> {
  const sodium = await getSodium();

  const sEncode = ourKeyPair.privateKey.slice(0, 32);

  const shaFullLength = sodium.crypto_hash_sha512(sEncode);

  const H_rh = shaFullLength.slice(32);

  const r = sodium.crypto_core_ed25519_scalar_reduce(sha512Multipart([H_rh, kA, messageParts]));

  const sigR = sodium.crypto_scalarmult_ed25519_base_noclamp(r);

  const HRAM = sodium.crypto_core_ed25519_scalar_reduce(sha512Multipart([sigR, kA, messageParts]));

  const sig_s = sodium.crypto_core_ed25519_scalar_add(
    r,
    sodium.crypto_core_ed25519_scalar_mul(HRAM, ka)
  );

  const full_sig = concatUInt8Array(sigR, sig_s);
  return full_sig;
}

export const sha512Multipart = (parts: Array<Uint8Array>) => {
  return crypto_hash_sha512(concatUInt8Array(...parts));
};

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
