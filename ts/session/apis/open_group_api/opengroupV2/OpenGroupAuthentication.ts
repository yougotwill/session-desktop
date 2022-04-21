import {
  fromHex,
  fromHexToArray,
  fromUInt8ArrayToBase64,
  stringToUint8Array,
  toHex,
} from '../../../utils/String';
import { concatUInt8Array, getSodium } from '../../../crypto';
import { crypto_hash_sha512, to_hex } from 'libsodium-wrappers-sumo';
import { sessionGenerateKeyPair } from '../../../../util/accountManager';
import { ByteKeyPair } from '../../../utils/User';
import { StringUtils, UserUtils } from '../../../utils';

const debugOutput = (key: string, headers: any, blinded: boolean) => {
  const common: Record<string, string | number> = {
    'X-SOGS-Timestamp': 1642472103,
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

  const expected = testSet[key];

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
  const ed52219KeyPair: ByteKeyPair = {
    privKeyBytes: signingKeys.ed25519KeyPair.privateKey,
    pubKeyBytes: signingKeys.ed25519KeyPair.publicKey,
  };

  console.warn('signingKeys pub: ', to_hex(ed52219KeyPair.pubKeyBytes));
  console.warn('signingKeys priv: ', to_hex(ed52219KeyPair.privKeyBytes));

  const serverPK = fromHexToArray(
    'c3b3c6f32f0ab5a57f853cc4f30f5da7fda5624b0c77b3fb0829de562ada081d'
  );
  const nonce = fromHexToArray('09d0799f2295990182c3ab3406fbfc5b');
  const ts = 1642472103;
  const method = 'GET';
  const path = '/room/the-best-room/messages/recent?limit=25';

  console.info('blinded test', '#'.repeat(60));
  const blindedHeaders = await getOpenGroupHeaders({
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
  const unblindedHeaders = await getOpenGroupHeaders({
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

/**
 *
 * @param data data
 * @returns
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
  const sodium = await getSodium();
  let pubkey;

  let ka;
  let kA;
  if (blinded) {
    const blindingValues = await getBlindingValues(serverPK, signingKeys);
    ka = blindingValues.ka;
    kA = blindingValues.kA;
    pubkey = `15${toHex(kA)}`;
  } else {
    pubkey = `00${toHex(signingKeys.pubKeyBytes)}`;
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
  const sodium = await getSodium();

  const sEncode = ourKeyPair.privKeyBytes.slice(0, 32);

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

export const getBlindingValues = async (
  serverPK: Uint8Array,
  signingKeys: ByteKeyPair
): Promise<{
  a: Uint8Array;
  ka: Uint8Array;
  kA: Uint8Array;
}> => {
  const sodium = await getSodium();

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
 * Sending a SOGS DM
 */
export async function sendDmTest() {
  // const sodium = await getSodium();
  // todo: implement sending dms
}

/**
 * Used for encrypting a blinded message (request) to a SOGS user.
 * @param body body of the message being encrypted
 * @param serverPK the server public key being sent to. Cannot be b64 encoded. Use fromHex and be sure to exclude the blinded 00/15/05 prefixes
 * @returns
 */
export const encryptBlindedOpenGroupMessage = async (
  body: any,
  recipientPubKey: string,
  serverPK: Uint8Array
): Promise<Uint8Array | null> => {
  // TODO: need a, kB, kA and kB for this to work.
  // a - our group specific enc_key
  // kB - their group specific 15 pubkey
  // kA - our group spec. 15 pubkey

  const signingKeys = await UserUtils.getUserED25519KeyPairBytes();
  if (!signingKeys) {
    window?.log?.error('encryptBlindedOpenGroupMessage - failed to get signing key data');
    return null;
  }

  // our blinding values
  const { a, ka, kA } = await getBlindingValues(serverPK, signingKeys);
  console.warn(a, ka, kA);

  // the user we're sending to
  const kB = new Uint8Array(fromHex(recipientPubKey.substring(2)));

  const sodium = await getSodium();
  const encryptKey = sodium.crypto_generichash(
    32,
    concatUInt8Array(sodium.crypto_scalarmult_ed25519_noclamp(a, kB), kA, kB)
  );

  // inner data: msg || A (i.e. the sender's ed25519 master pubkey, *not* the kA blinded pubkey)
  const plaintext = concatUInt8Array(
    new Uint8Array(StringUtils.encode(body, 'utf8')),
    signingKeys.pubKeyBytes
  );

  const nonce = sodium.randombytes_buf(24);

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

  // TODO: if it doesn't work. Add logging on pysogs dev instance. Copy example values and use output for TDD.
  return data;
};

export const decryptBlindedOpenGroupMessage = async (
  data: Uint8Array,
  serverPubKey: string,
  senderPubKey: string
): Promise<any> => {
  //  Decrypting a SOGS DM
  //  Opening the box on the recipient end.

  //  I receive alongside the message from sogs (i.e. this is the blinded session id minus the '15')
  //  kA=...

  //  Calculate the shared encryption key (see above)
  const sodium = await getSodium();

  const signingKeys = await UserUtils.getUserED25519KeyPairBytes();

  if (!signingKeys) {
    window?.log?.error('decryptBlindedMessage - Cannot get signing keys required for decryption');
    return;
  }

  // the user we're sending to
  const kB = fromHexToArray(senderPubKey.substring(2));

  const { a, ka, kA } = await getBlindingValues(fromHexToArray(serverPubKey), signingKeys);
  const decryptKey = sodium.crypto_generichash(
    32,
    concatUInt8Array(sodium.crypto_scalarmult_ed25519_noclamp(a, kB), kB, kA)
  );

  // enc and dec key on either side of the pipeline should be equal length.

  const dataEndIdx = data.length - 1;
  const version = data[0];

  // todo: add early exit condition for if version isn't right

  const ciphertext = data.slice(1, dataEndIdx - 24);
  const nonce = data.slice(dataEndIdx - 24);

  const plaintext = sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    null,
    nonce,
    decryptKey
  );

  if (plaintext.length <= 32) {
    window?.log?.warn('plain text isnt as long as expected. Possible error');
  }

  const plaintextLastIdx = plaintext.length - 1;
  const message = plaintext.slice(0, plaintextLastIdx - 32);
  const senderUnblindedEd25519Key = plaintext.slice(plaintextLastIdx - 32);

  const messageStr = StringUtils.decode(message, 'utf8');
  const senderSessionId = `05${to_hex(senderUnblindedEd25519Key)}`;

  // msg should equal the cake in decrypt msg. Sender PK (without prefix) should === A
};
