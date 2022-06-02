import { fromUInt8ArrayToBase64, stringToUint8Array, toHex } from '../../../utils/String';
import { concatUInt8Array, getSodiumRenderer } from '../../../crypto';
import { crypto_hash_sha512, to_hex } from 'libsodium-wrappers-sumo';
import { ByteKeyPair } from '../../../utils/User';
import { StringUtils } from '../../../utils';
import { KeyPrefixType } from '../../../types';

/**
 *
 * @param data data
 */
export async function getOpenGroupHeaders(data: {
  /**
   * Our ED25519 Key pair
   */
  signingKeys: ByteKeyPair;
  /**
   * The server public key - before blinding
   */
  serverPK: Uint8Array;
  nonce: Uint8Array;
  method: string;
  path: string;
  /** Note: on server side both text and number timestamps are accepted */
  timestamp: number;
  /** Apply blinding modifications or not */
  blinded: boolean;
  body?: string;
}) {
  const { signingKeys, serverPK, nonce, method, path, timestamp, blinded, body } = data;
  const sodium = await getSodiumRenderer();
  let pubkey;

  let ka;
  let kA;
  if (blinded) {
    const blindingValues = await getBlindingValues(serverPK, signingKeys);
    ka = blindingValues.ka;
    kA = blindingValues.kA;
    pubkey = `${KeyPrefixType.blinded}${toHex(kA)}`;
  } else {
    pubkey = `${KeyPrefixType.unblinded}${toHex(signingKeys.pubKeyBytes)}`;
  }

  // SERVER_PUBKEY || NONCE || TIMESTAMP || METHOD || PATH || HASHED_BODY
  let toSign = concatUInt8Array(
    serverPK,
    nonce,
    stringToUint8Array(timestamp.toString()),
    stringToUint8Array(method),
    stringToUint8Array(path)
  );

  if (body) {
    toSign = concatUInt8Array(toSign, sodium.crypto_generichash(64, body));
  }

  let signature;
  if (blinded && ka && kA) {
    signature = await blindedED25519Signature(toSign, signingKeys, ka, kA);
  } else {
    signature = sodium.crypto_sign_detached(toSign, signingKeys.privKeyBytes);
  }

  const sogsSignature = fromUInt8ArrayToBase64(signature);
  const headers = {
    'X-SOGS-Pubkey': pubkey,
    'X-SOGS-Timestamp': `${timestamp}`,
    'X-SOGS-Nonce': fromUInt8ArrayToBase64(nonce),
    'X-SOGS-Signature': sogsSignature,
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
  ourKeyPair: ByteKeyPair,
  ka: Uint8Array,
  kA: Uint8Array
): Promise<Uint8Array> {
  const sodium = await getSodiumRenderer();

  const sEncode = ourKeyPair.privKeyBytes.slice(0, 32);

  const shaFullLength = sodium.crypto_hash_sha512(sEncode);

  const Hrh = shaFullLength.slice(32);

  const r = sodium.crypto_core_ed25519_scalar_reduce(sha512Multipart([Hrh, kA, messageParts]));

  const sigR = sodium.crypto_scalarmult_ed25519_base_noclamp(r);

  const HRAM = sodium.crypto_core_ed25519_scalar_reduce(sha512Multipart([sigR, kA, messageParts]));

  const sigS = sodium.crypto_core_ed25519_scalar_add(
    r,
    sodium.crypto_core_ed25519_scalar_mul(HRAM, ka)
  );

  const fullSig = concatUInt8Array(sigR, sigS);
  return fullSig;
}

export const sha512Multipart = (parts: Array<Uint8Array>) => {
  return crypto_hash_sha512(concatUInt8Array(...parts));
};

/**
 * Creates a blinded pubkey for specific use with a certain open group
 * @param serverPK The server we're blinding against
 * @param signingKeys Our signing keys (ED25519)
 * @returns Prefixed blinded pubkey for the open group
 */
export const getBlindedPubKey = async (
  serverPK: Uint8Array,
  signingKeys: ByteKeyPair
): Promise<string | null> => {
  const blindedPubKeyBytes = await getBlindingValues(serverPK, signingKeys);
  if (blindedPubKeyBytes) {
    return `${KeyPrefixType.blinded}${to_hex(blindedPubKeyBytes.kA)}`;
  }
  return null;
};

export const getBlindingValues = async (
  serverPK: Uint8Array,
  signingKeys: ByteKeyPair
): Promise<{
  a: Uint8Array;
  ka: Uint8Array;
  kA: Uint8Array;
}> => {
  const sodium = await getSodiumRenderer();

  let ka;
  let kA;
  const k = sodium.crypto_core_ed25519_scalar_reduce(sodium.crypto_generichash(64, serverPK));

  // use curve key i.e. s.privKey
  let a = sodium.crypto_sign_ed25519_sk_to_curve25519(signingKeys.privKeyBytes);

  if (a.length > 32) {
    console.warn('length of signing key is too long, cutting to 32: oldlength', length);
    a = a.slice(0, 32);
  }

  // our blinded keypair
  ka = sodium.crypto_core_ed25519_scalar_mul(k, a); // had to cast for some reason

  kA = sodium.crypto_scalarmult_ed25519_base_noclamp(ka);

  return {
    a,
    ka,
    kA,
  };
};

/**
 * Used for encrypting a blinded message (request) to a SOGS user.
 * @param body body of the message being encrypted
 * @param serverPK the server public key being sent to. Cannot be b64 encoded. Use fromHex and be sure to exclude the blinded 00/15/05 prefixes
 */
export const encryptBlindedMessage = async (options: {
  body: any;
  senderSigningKey: ByteKeyPair;
  /** Pubkey that corresponds to the recipients blinded PubKey */
  serverPubKey: Uint8Array;
  recipientSigningKey?: ByteKeyPair;
  recipientBlindedPublicKey?: Uint8Array;
}): Promise<Uint8Array | null> => {
  const {
    body,
    senderSigningKey,
    serverPubKey,
    recipientSigningKey,
    recipientBlindedPublicKey,
  } = options;
  const sodium = await getSodiumRenderer();

  console.warn({ options });

  const aBlindingValues = await getBlindingValues(serverPubKey, senderSigningKey);

  let kB;
  if (!recipientBlindedPublicKey && recipientSigningKey) {
    const bBlindingValues = await getBlindingValues(serverPubKey, recipientSigningKey);
    kB = bBlindingValues.kA;
  }
  if (recipientBlindedPublicKey) {
    kB = recipientBlindedPublicKey;
  }

  if (!kB) {
    window?.log?.error('No recipient-side data provided for encryption');
    return null;
  }

  const { a, kA } = aBlindingValues;

  const encryptKey = sodium.crypto_generichash(
    32,
    concatUInt8Array(sodium.crypto_scalarmult_ed25519_noclamp(a, kB), kA, kB)
  );

  // inner data: msg || A (i.e. the sender's ed25519 master pubkey, *not* the kA blinded pubkey)
  const plaintext = concatUInt8Array(
    new Uint8Array(StringUtils.encode(body, 'utf8')),
    senderSigningKey.pubKeyBytes
  );

  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    null,
    null,
    nonce,
    encryptKey
  );

  // not sure what this part is for but it's in the example
  // after looking at the decrypt - it might be to denote the encryption version
  const prefixData = new Uint8Array(StringUtils.encode('\x00', 'utf8'));
  const data = concatUInt8Array(prefixData, ciphertext, nonce);
  return data;
};

/**
 *
 * @param data The data to be decrypted from the sender
 * @param aSignKeyBytes the sender's keypair bytes
 * @param bSignKeyBytes the receivers keypair bytes
 * @param serverPubKey the server the message is sent to
 */
export const decryptBlindedMessage = async (
  data: Uint8Array,
  aSignKeyBytes: ByteKeyPair,
  bSignKeyBytes: ByteKeyPair,
  serverPubKey: Uint8Array
): Promise<| {
    messageText: string;
    senderED25519PubKey: string;
    senderSessionId: string;
  }
| undefined> => {
  const sodium = await getSodiumRenderer();

  const aBlindingValues = await getBlindingValues(serverPubKey, aSignKeyBytes);
  const bBlindingValues = await getBlindingValues(serverPubKey, bSignKeyBytes);
  const { kA } = aBlindingValues;
  const { a: b, kA: kB } = bBlindingValues;

  const k = sodium.crypto_core_ed25519_scalar_reduce(sodium.crypto_generichash(64, serverPubKey));

  const decryptKey = sodium.crypto_generichash(
    32,
    concatUInt8Array(sodium.crypto_scalarmult_ed25519_noclamp(b, kA), kA, kB)
  );

  const version = data[0];
  if (version !== 0) {
    window?.log?.error(
      'decryptBlindedMessage - Dropping message due to unsupported encryption version'
    );
    return;
  }

  const nonceLength = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  const ciphertextIncoming = data.slice(1, data.length - nonceLength);
  const nonceIncoming = data.slice(data.length - nonceLength);

  const plaintextIncoming = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertextIncoming,
    null,
    nonceIncoming,
    decryptKey
  );

  console.warn({ plaintextIncoming });
  if (plaintextIncoming.length <= 32) {
    // throw Error;
    window?.log?.error('decryptBlindedMessage: plaintext unsufficient length');
    return;
  }

  const msg = plaintextIncoming.slice(0, plaintextIncoming.length - 32);
  const senderEdpk = plaintextIncoming.slice(plaintextIncoming.length - 32);

  if (to_hex(kA) !== to_hex(sodium.crypto_scalarmult_ed25519_noclamp(k, senderEdpk))) {
    throw Error;
  }

  const messageText = StringUtils.decode(msg, 'utf8');
  console.warn({ messageText });

  const senderSessionId = `${KeyPrefixType.standard}${to_hex(
    sodium.crypto_sign_ed25519_pk_to_curve25519(senderEdpk)
  )}`;
  const senderED25519PubKey = to_hex(senderEdpk);
  console.warn({ senderED25519PubKey });

  return {
    messageText,
    senderED25519PubKey,
    senderSessionId,
  };
};
