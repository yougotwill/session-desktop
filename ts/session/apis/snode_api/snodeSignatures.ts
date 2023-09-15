import { FixedSizeUint8Array, GroupPubkeyType } from 'libsession_util_nodejs';
import { getSodiumRenderer } from '../../crypto';
import { StringUtils, UserUtils } from '../../utils';
import { fromHexToArray, fromUInt8ArrayToBase64 } from '../../utils/String';
import { GetNetworkTime } from './getNetworkTime';
import { SnodeNamespaces } from './namespaces';
import { PubKey } from '../../types';
import { toFixedUint8ArrayOfLength } from '../../../types/sqlSharedTypes';

export type SnodeSignatureResult = {
  timestamp: number;
  signature: string;
  pubkey_ed25519: string;
  pubkey: string; // this is the x25519 key of the pubkey we are doing the request to (ourself for our swarm usually)
};

export type SnodeGroupSignatureResult = Pick<SnodeSignatureResult, 'signature' | 'timestamp'> & {
  pubkey: GroupPubkeyType; // this is the 03 pubkey of the corresponding group
};

async function getSnodeSignatureByHashesParams({
  messages,
  method,
  pubkey,
}: {
  pubkey: string;
  messages: Array<string>;
  method: 'delete';
}): Promise<
  Pick<SnodeSignatureResult, 'pubkey_ed25519' | 'signature' | 'pubkey'> & {
    messages: Array<string>;
  }
> {
  const ourEd25519Key = await UserUtils.getUserED25519KeyPair();

  if (!ourEd25519Key) {
    const err = `getSnodeSignatureParams "${method}": User has no getUserED25519KeyPair()`;
    window.log.warn(err);
    throw new Error(err);
  }
  const edKeyPrivBytes = fromHexToArray(ourEd25519Key?.privKey);
  const verificationData = StringUtils.encode(`${method}${messages.join('')}`, 'utf8');
  const message = new Uint8Array(verificationData);

  const sodium = await getSodiumRenderer();
  try {
    const signature = sodium.crypto_sign_detached(message, edKeyPrivBytes);
    const signatureBase64 = fromUInt8ArrayToBase64(signature);

    return {
      signature: signatureBase64,
      pubkey_ed25519: ourEd25519Key.pubKey,
      pubkey,
      messages,
    };
  } catch (e) {
    window.log.warn('getSnodeSignatureParams failed with: ', e.message);
    throw e;
  }
}

type SnodeSigParamsShared = {
  namespace: number | null | 'all'; // 'all' can be used to clear all namespaces (during account deletion)
  method: 'retrieve' | 'store' | 'delete_all';
};

type SnodeSigParamsAdminGroup = SnodeSigParamsShared & {
  groupPk: GroupPubkeyType;
  privKey: Uint8Array; // our ed25519 key when we are signing with our pubkey
};
type SnodeSigParamsUs = SnodeSigParamsShared & {
  pubKey: string;
  privKey: FixedSizeUint8Array<64>;
};

function isSigParamsForGroupAdmin(
  sigParams: SnodeSigParamsAdminGroup | SnodeSigParamsUs
): sigParams is SnodeSigParamsAdminGroup {
  const asGr = sigParams as SnodeSigParamsAdminGroup;
  return PubKey.isClosedGroupV2(asGr.groupPk) && !!asGr.privKey;
}

async function getSnodeShared(params: SnodeSigParamsAdminGroup | SnodeSigParamsUs) {
  const signatureTimestamp = GetNetworkTime.getNowWithNetworkOffset();
  const verificationData = StringUtils.encode(
    `${params.method}${params.namespace === 0 ? '' : params.namespace}${signatureTimestamp}`,
    'utf8'
  );
  try {
    const message = new Uint8Array(verificationData);
    const sodium = await getSodiumRenderer();
    const signature = sodium.crypto_sign_detached(message, params.privKey as Uint8Array);
    const signatureBase64 = fromUInt8ArrayToBase64(signature);
    if (isSigParamsForGroupAdmin(params)) {
      return {
        timestamp: signatureTimestamp,
        signature: signatureBase64,
        pubkey: params.groupPk,
      };
    }
    return {
      timestamp: signatureTimestamp,
      signature: signatureBase64,
    };
  } catch (e) {
    window.log.warn('getSnodeShared failed with: ', e.message);
    throw e;
  }
}

async function getSnodeSignatureParamsUs({
  method,
  namespace = 0,
}: Pick<SnodeSigParamsUs, 'method' | 'namespace'>): Promise<SnodeSignatureResult> {
  const ourEd25519Key = await UserUtils.getUserED25519KeyPairBytes();
  const ourEd25519PubKey = await UserUtils.getUserED25519KeyPair();

  if (!ourEd25519Key || !ourEd25519PubKey) {
    const err = `getSnodeSignatureParams "${method}": User has no getUserED25519KeyPairBytes()`;
    window.log.warn(err);
    throw new Error(err);
  }

  const edKeyPrivBytes = ourEd25519Key.privKeyBytes;

  const lengthCheckedPrivKey = toFixedUint8ArrayOfLength(edKeyPrivBytes, 64);
  const sigData = await getSnodeShared({
    pubKey: UserUtils.getOurPubKeyStrFromCache(),
    method,
    namespace,
    privKey: lengthCheckedPrivKey,
  });

  const us = UserUtils.getOurPubKeyStrFromCache();
  return {
    ...sigData,
    pubkey_ed25519: ourEd25519PubKey.pubKey,
    pubkey: us,
  };
}

async function getSnodeGroupSignatureParams({
  groupIdentityPrivKey,
  groupPk,
  method,
  namespace = 0,
}: {
  groupPk: GroupPubkeyType;
  groupIdentityPrivKey: FixedSizeUint8Array<64>;
  namespace: SnodeNamespaces;
  method: 'retrieve' | 'store';
}): Promise<SnodeGroupSignatureResult> {
  const sigData = await getSnodeShared({
    pubKey: groupPk,
    method,
    namespace,
    privKey: groupIdentityPrivKey,
  });
  return { ...sigData, pubkey: groupPk };
}

async function generateUpdateExpirySignature({
  shortenOrExtend,
  timestamp,
  messageHashes,
}: {
  shortenOrExtend: 'extend' | 'shorten' | '';
  timestamp: number;
  messageHashes: Array<string>;
}): Promise<{ signature: string; pubkey_ed25519: string } | null> {
  const ourEd25519Key = await UserUtils.getUserED25519KeyPair();

  if (!ourEd25519Key) {
    const err = 'getSnodeSignatureParams "expiry": User has no getUserED25519KeyPair()';
    window.log.warn(err);
    throw new Error(err);
  }

  const edKeyPrivBytes = fromHexToArray(ourEd25519Key?.privKey);

  // "expire" || ShortenOrExtend || expiry || messages[0] || ... || messages[N]
  const verificationString = `expire${shortenOrExtend}${timestamp}${messageHashes.join('')}`;
  const verificationData = StringUtils.encode(verificationString, 'utf8');
  const message = new Uint8Array(verificationData);

  const sodium = await getSodiumRenderer();
  try {
    const signature = sodium.crypto_sign_detached(message, edKeyPrivBytes);
    const signatureBase64 = fromUInt8ArrayToBase64(signature);

    return {
      signature: signatureBase64,
      pubkey_ed25519: ourEd25519Key.pubKey,
    };
  } catch (e) {
    window.log.warn('generateSignature failed with: ', e.message);
    return null;
  }
}

export const SnodeSignature = {
  getSnodeSignatureParamsUs,
  getSnodeGroupSignatureParams,
  getSnodeSignatureByHashesParams,
  generateUpdateExpirySignature,
};
