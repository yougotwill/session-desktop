import { getV2OpenGroupRoomByRoomId, OpenGroupV2Room } from '../../../../data/opengroups';
import { getConversationController } from '../../../conversations';
import { getSodium } from '../../../crypto';
import { PromiseUtils, StringUtils, ToastUtils, UserUtils } from '../../../utils';
import { fromHexToArray, fromUInt8ArrayToBase64, toHex } from '../../../utils/String';
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
 * Checks if the group pubkey (hashed as blake2b) is in the list of blocked groups (also hashed)
 * @param serverPubKey PubKey of the open group being evaluated
 * @returns true - group is in the blocklist, false - the group is not in the blocklist
 */
export const isGroupInBlockList = async (serverPubKey: string): Promise<boolean> => {
  const blockList = window?.getOpenGroupBlockList();
  window?.log?.warn({ blockList });
  if (!blockList || !blockList.length) {
    return false;
  }

  const sodium = await getSodium();
  // generic hash is blake2b
  const serverPubKeyBlake2bHash = sodium.crypto_generichash(32, serverPubKey, null, 'hex');
  return blockList.includes(serverPubKeyBlake2bHash);
};

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

  if (await isGroupInBlockList(room.serverPublicKey)) {
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
    const keypair = createOpenGroupKeyPair(room, true); // todo: get blinding capabilities from endpoint
    console.warn({ keypair });

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

type BlindedKeyPair = {
  /**
   * The blinded public key of this device to send to open groups
   */
  PublicKey: string;
  /**
   * The corresponding private key to be used with this public key
   */
  SecretKey: string;
};

async function createOpenGroupKeyPair(
  room: OpenGroupV2Room,
  blinded: boolean
): Promise<BlindedKeyPair | null> {
  // getting our secretKey
  const ourKeyPair = await UserUtils.getUserED25519KeyPair();
  if (!ourKeyPair) {
    return null;
  }
  const ourSecretKey = fromHexToArray(ourKeyPair.privKey);
  if (blinded) {
    // a priv, A pub
    // k = reduced(genericHashed(A))
    // 15 + kA
    const sodium = await getSodium();
    const { crypto_core_ed25519_scalar_reduce, crypto_generichash } = sodium;
    const hashedServerPubKey = crypto_generichash(64, room.serverPublicKey);
    const reducedHashOfPubKey = crypto_core_ed25519_scalar_reduce(hashedServerPubKey);

    // ka - blinded private
    const blindedSecretKey = sodium.crypto_core_ed25519_scalar_mul(
      reducedHashOfPubKey,
      ourSecretKey
    );

    // todo: id-blinding - check if supposed to generate blinded pubkey as well
    const kA = sodium.crypto_scalarmult_ed25519_base_noclamp(blindedSecretKey);

    const blindedPublicKey = `15${toHex(kA)}`; // blinded session ID - kA

    return {
      // todo: pk is being returned as string - should it be uint8 or string?
      PublicKey: blindedPublicKey,
      SecretKey: toHex(blindedSecretKey),
    };
  } else {
    // for unblinded we send our ed25519 master pubkey in X-SOGS-Pubkey header with 00 prefix to denote it's unblinded
    return {
      PublicKey: `00${ourKeyPair.pubKey}`,
      SecretKey: ourKeyPair.privKey,
    };
  }
}

async function createSignatureForOpenGroup(
  room: OpenGroupV2Room,
  blinded: boolean,
  method: string,
  path: string,
  hbody: string
) {
  // StringUtils.encode('', 'utf8');
  const sodium = await getSodium();
  const nonce = new Uint8Array(sodium.crypto_secretbox_NONCEBYTES);
  const utf8ToUint8 = (s: string) => new Uint8Array(StringUtils.encode(s, 'utf8'));
  const timestampBytes = utf8ToUint8(Date.now().toString()); // todo: probably has to be bytes

  // const hbodyBytes = hbody ? utf8ToUint8(hbody) : [];
  const hbodyBytes = sodium.crypto_generichash(64, hbody);

  // We need to sign:
  // SERVER_PUBKEY || NONCE || TIMESTAMP || METHOD || PATH || HBODY
  const toSign = [
    ...utf8ToUint8(room.serverPublicKey),
    ...nonce,
    ...timestampBytes,
    ...utf8ToUint8(method),
    ...utf8ToUint8(path),
    ...hbodyBytes,
  ];

  let sig;
  if (blinded) {
    // sig = blinded_ed25519_signature(toSign, s, ka, KA) // todo: expose s, ka and KA for this
  } else {
    // todo: implement signature without blinding
  }
}

async function signWithBlindedKey() {
  // todo: id-blinding - supposedly similar to regular signing. This method should only be called on blinded keys (ones containing 15 prefix) otherwise use the regular signing method
}

async function generatePrivateKeyScalar(): Promise<Uint8Array | null> {
  const sodium = await getSodium();
  const ourKeyPair = await UserUtils.getUserED25519KeyPair();
  if (!ourKeyPair) {
    return null;
  }
  const EDPrivKey = ourKeyPair.privKey;
  return sodium.crypto_sign_ed25519_sk_to_curve25519(fromHexToArray(EDPrivKey));
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
