import { GroupPubkeyType } from 'libsession_util_nodejs';
import { isEmpty } from 'lodash';
import { toFixedUint8ArrayOfLength } from '../../../types/sqlSharedTypes';
import { getSodiumRenderer } from '../../crypto';
import { PubKey } from '../../types';
import { StringUtils, UserUtils } from '../../utils';
import { fromHexToArray, fromUInt8ArrayToBase64 } from '../../utils/String';
import { PreConditionFailed } from '../../utils/errors';
import { GetNetworkTime } from './getNetworkTime';
import { SnodeNamespacesGroup } from './namespaces';

type WithTimestamp = { timestamp: number };

export type SnodeSignatureResult = WithTimestamp & {
  signature: string;
  pubkey_ed25519: string;
  pubkey: string; // this is the x25519 key of the pubkey we are doing the request to (ourself for our swarm usually)
};

type ShortenOrExtend = 'extend' | 'shorten' | '';
type WithShortenOrExtend = { shortenOrExtend: ShortenOrExtend };
type WithMessagesHashes = { messagesHashes: Array<string> };

export type SnodeGroupSignatureResult = Pick<SnodeSignatureResult, 'signature' | 'timestamp'> & {
  pubkey: GroupPubkeyType; // this is the 03 pubkey of the corresponding group
};

async function getSnodeSignatureByHashesParams({
  messagesHashes,
  method,
  pubkey,
}: WithMessagesHashes & {
  pubkey: string;
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
  const verificationData = StringUtils.encode(`${method}${messagesHashes.join('')}`, 'utf8');
  const message = new Uint8Array(verificationData);

  const sodium = await getSodiumRenderer();
  try {
    const signature = sodium.crypto_sign_detached(message, edKeyPrivBytes);
    const signatureBase64 = fromUInt8ArrayToBase64(signature);

    return {
      signature: signatureBase64,
      pubkey_ed25519: ourEd25519Key.pubKey,
      pubkey,
      messages: messagesHashes,
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
  privKey: Uint8Array; // len 64
};
type SnodeSigParamsUs = SnodeSigParamsShared & {
  pubKey: string;
  privKey: Uint8Array; // len 64
};

function isSigParamsForGroupAdmin(
  sigParams: SnodeSigParamsAdminGroup | SnodeSigParamsUs
): sigParams is SnodeSigParamsAdminGroup {
  const asGr = sigParams as SnodeSigParamsAdminGroup;
  return PubKey.isClosedGroupV2(asGr.groupPk) && !!asGr.privKey;
}

async function getSnodeSignatureShared(params: SnodeSigParamsAdminGroup | SnodeSigParamsUs) {
  const signatureTimestamp = GetNetworkTime.getNowWithNetworkOffset();
  const verificationData = StringUtils.encode(
    `${params.method}${params.namespace === 0 ? '' : params.namespace}${signatureTimestamp}`,
    'utf8'
  );
  try {
    const message = new Uint8Array(verificationData);
    const sodium = await getSodiumRenderer();
    const signature = sodium.crypto_sign_detached(message, params.privKey);
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
  const sigData = await getSnodeSignatureShared({
    pubKey: UserUtils.getOurPubKeyStrFromCache(),
    method,
    namespace,
    privKey: lengthCheckedPrivKey.buffer,
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
  namespace,
}: {
  groupPk: GroupPubkeyType;
  groupIdentityPrivKey: Uint8Array; // len 64
  namespace: SnodeNamespacesGroup;
  method: 'retrieve' | 'store';
}): Promise<SnodeGroupSignatureResult> {
  const sigData = await getSnodeSignatureShared({
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
  messagesHashes,
  ed25519Privkey,
  ed25519Pubkey,
}: WithMessagesHashes &
  WithShortenOrExtend &
  WithTimestamp & {
    ed25519Privkey: Uint8Array; // len 64
    ed25519Pubkey: string;
  }): Promise<{ signature: string; pubkey: string }> {
  // "expire" || ShortenOrExtend || expiry || messages[0] || ... || messages[N]
  const verificationString = `expire${shortenOrExtend}${timestamp}${messagesHashes.join('')}`;
  const verificationData = StringUtils.encode(verificationString, 'utf8');
  const message = new Uint8Array(verificationData);

  const sodium = await getSodiumRenderer();

  const signature = sodium.crypto_sign_detached(message, ed25519Privkey);
  const signatureBase64 = fromUInt8ArrayToBase64(signature);

  if (isEmpty(signatureBase64) || isEmpty(ed25519Pubkey)) {
    throw new Error('generateUpdateExpirySignature: failed to build signature');
  }

  return {
    signature: signatureBase64,
    pubkey: ed25519Pubkey,
  };
}

async function generateUpdateExpiryOurSignature({
  shortenOrExtend,
  timestamp,
  messagesHashes,
}: WithMessagesHashes & WithShortenOrExtend & WithTimestamp) {
  const ourEd25519Key = await UserUtils.getUserED25519KeyPair();

  if (!ourEd25519Key) {
    const err = 'getSnodeSignatureParams "expiry": User has no getUserED25519KeyPair()';
    window.log.warn(err);
    throw new PreConditionFailed(err);
  }

  const edKeyPrivBytes = fromHexToArray(ourEd25519Key?.privKey);

  return generateUpdateExpirySignature({
    messagesHashes,
    shortenOrExtend,
    timestamp,
    ed25519Privkey: toFixedUint8ArrayOfLength(edKeyPrivBytes, 64).buffer,
    ed25519Pubkey: ourEd25519Key.pubKey,
  });
}

async function generateUpdateExpiryGroupSignature({
  shortenOrExtend,
  timestamp,
  messagesHashes,
  groupPrivKey,
  groupPk,
}: WithMessagesHashes &
  WithShortenOrExtend &
  WithTimestamp & {
    groupPk: GroupPubkeyType;
    groupPrivKey: Uint8Array; // len 64
  }) {
  if (isEmpty(groupPrivKey) || isEmpty(groupPk)) {
    throw new PreConditionFailed(
      'generateUpdateExpiryGroupSignature groupPrivKey or groupPk is empty'
    );
  }

  return generateUpdateExpirySignature({
    messagesHashes,
    shortenOrExtend,
    timestamp,
    ed25519Privkey: groupPrivKey,
    ed25519Pubkey: groupPk,
  });
}

export const SnodeSignature = {
  getSnodeSignatureParamsUs,
  getSnodeGroupSignatureParams,
  getSnodeSignatureByHashesParams,
  generateUpdateExpiryOurSignature,
  generateUpdateExpiryGroupSignature,
};
