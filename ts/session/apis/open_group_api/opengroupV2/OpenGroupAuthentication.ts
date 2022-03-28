import {
  fromHex,
  fromHexToArray,
  fromUInt8ArrayToBase64,
  stringToUint8Array,
  toHex,
} from '../../../utils/String';
import { concatUInt8Array, getSodium } from '../../../crypto';
import { crypto_hash_sha512, KeyPair, to_hex } from 'libsodium-wrappers-sumo';
import { sessionGenerateKeyPair } from '../../../../util/accountManager';

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
  const ed52219KeyPair: KeyPair = signingKeys.ed25519KeyPair;

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
  signingKeys: KeyPair;
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
    signature = sodium.crypto_sign_detached(toSign, signingKeys.privateKey);
  }

  const sogsSignature = fromUInt8ArrayToBase64(signature);
  const headers = {
    'X-SOGS-Pubkey': pubkey,
    'X-SOGS-Timestamp': `${timestamp}`,
    'X-SOGS-Nonce': fromUInt8ArrayToBase64(nonce),
    'X-SOGS-Signature': sogsSignature,
  };

  console.warn('headers', headers);

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
 * Sending a SOGS DM
 */
export async function sendDmTest() {
  // const sodium = await getSodium();
  // todo: implement sending dms
}
