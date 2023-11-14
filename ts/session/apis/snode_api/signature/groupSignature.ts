import {
  GroupPubkeyType,
  PubkeyType,
  Uint8ArrayLen100,
  Uint8ArrayLen64,
  UserGroupsGet,
} from 'libsession_util_nodejs';
import { isEmpty, isString } from 'lodash';
import {
  MetaGroupWrapperActions,
  UserGroupsWrapperActions,
} from '../../../../webworker/workers/browser/libsession_worker_interface';
import { getSodiumRenderer } from '../../../crypto/MessageEncrypter';
import { GroupUpdateInviteMessage } from '../../../messages/outgoing/controlMessage/group_v2/to_user/GroupUpdateInviteMessage';
import { StringUtils, UserUtils } from '../../../utils';
import { fromUInt8ArrayToBase64, stringToUint8Array } from '../../../utils/String';
import { PreConditionFailed } from '../../../utils/errors';
import { GetNetworkTime } from '../getNetworkTime';
import { SnodeNamespacesGroup } from '../namespaces';
import { WithMessagesHashes, WithShortenOrExtend, WithTimestamp } from '../types';
import { SignatureShared } from './signatureShared';
import { SnodeSignatureResult } from './snodeSignatures';

async function getGroupInviteMessage({
  groupName,
  member,
  secretKey,
  groupPk,
}: {
  member: PubkeyType;
  groupName: string;
  secretKey: Uint8ArrayLen64; // len 64
  groupPk: GroupPubkeyType;
}) {
  const sodium = await getSodiumRenderer();
  const timestamp = GetNetworkTime.now();

  if (UserUtils.isUsFromCache(member)) {
    throw new Error('getGroupInviteMessage: we cannot invite ourselves');
  }
  debugger;

  // Note: as the signature is built with the timestamp here, we cannot override the timestamp later on the sending pipeline
  const adminSignature = sodium.crypto_sign_detached(
    stringToUint8Array(`INVITE${member}${timestamp}`),
    secretKey
  );
  const memberAuthData = await MetaGroupWrapperActions.makeSwarmSubAccount(groupPk, member);

  const invite = new GroupUpdateInviteMessage({
    groupName,
    groupPk,
    timestamp,
    adminSignature,
    memberAuthData,
  });
  return invite;
}

type ParamsShared = {
  groupPk: GroupPubkeyType;
  namespace: SnodeNamespacesGroup;
  method: 'retrieve' | 'store';
};

type SigParamsAdmin = ParamsShared & {
  groupIdentityPrivKey: Uint8ArrayLen64;
};

type SigParamsSubaccount = ParamsShared & {
  authData: Uint8ArrayLen100;
};

export type SigResultAdmin = Pick<SnodeSignatureResult, 'signature' | 'timestamp'> & {
  pubkey: GroupPubkeyType; // this is the 03 pubkey of the corresponding group
};

export type SigResultSubAccount = SigResultAdmin & {
  subaccount: string;
  subaccount_sig: string;
};

async function getSnodeGroupSignatureParams(params: SigParamsAdmin): Promise<SigResultAdmin>;
async function getSnodeGroupSignatureParams(
  params: SigParamsSubaccount
): Promise<SigResultSubAccount>;

async function getSnodeGroupSignatureParams(
  params: SigParamsAdmin | SigParamsSubaccount
): Promise<SigResultSubAccount | SigResultAdmin> {
  if ('groupIdentityPrivKey' in params) {
    return getSnodeGroupAdminSignatureParams(params);
  }
  return getSnodeGroupSubAccountSignatureParams(params);
}

async function getSnodeGroupSubAccountSignatureParams(
  params: SigParamsSubaccount
): Promise<SigResultSubAccount> {
  const { signatureTimestamp, toSign } =
    SignatureShared.getVerificationDataForStoreRetrieve(params);
  const sigResult = await MetaGroupWrapperActions.swarmSubaccountSign(
    params.groupPk,
    toSign,
    params.authData
  );
  return {
    ...sigResult,
    timestamp: signatureTimestamp,
    pubkey: params.groupPk,
  };
}

async function getSnodeGroupAdminSignatureParams(params: SigParamsAdmin): Promise<SigResultAdmin> {
  const sigData = await SignatureShared.getSnodeSignatureShared({
    pubKey: params.groupPk,
    method: params.method,
    namespace: params.namespace,
    privKey: params.groupIdentityPrivKey,
  });
  return { ...sigData, pubkey: params.groupPk };
}

type GroupDetailsNeededForSignature = Pick<UserGroupsGet, 'pubkeyHex' | 'authData' | 'secretKey'>;

async function getSnodeGroupSignature({
  group,
  method,
  namespace,
}: {
  group: GroupDetailsNeededForSignature | null;
  method: 'store' | 'retrieve';
  namespace: SnodeNamespacesGroup;
}) {
  if (!group) {
    throw new Error(`getSnodeGroupSignature: did not find group in wrapper`);
  }
  const { pubkeyHex: groupPk, secretKey, authData } = group;

  const groupSecretKey = secretKey && !isEmpty(secretKey) ? secretKey : null;
  const groupAuthData = authData && !isEmpty(authData) ? authData : null;

  if (groupSecretKey) {
    return getSnodeGroupSignatureParams({
      method,
      namespace,
      groupPk,
      groupIdentityPrivKey: groupSecretKey,
    });
  }
  if (groupAuthData) {
    const subAccountSign = await getSnodeGroupSignatureParams({
      groupPk,
      method,
      namespace,
      authData: groupAuthData,
    });
    return subAccountSign;
  }
  throw new Error(`getSnodeGroupSignature: needs either groupSecretKey or authData`);
}

async function signDataWithAdminSecret(
  verificationString: string | Uint8Array,
  group: Pick<GroupDetailsNeededForSignature, 'secretKey'>
) {
  const verificationData = isString(verificationString)
    ? StringUtils.encode(verificationString, 'utf8')
    : verificationString;
  const message = new Uint8Array(verificationData);

  if (!group) {
    throw new Error('signDataWithAdminSecret group was not found');
  }
  const { secretKey } = group;

  const groupSecretKey = secretKey && !isEmpty(secretKey) ? secretKey : null;
  if (!groupSecretKey) {
    throw new Error('groupSecretKey is empty');
  }
  const sodium = await getSodiumRenderer();

  return {
    signature: fromUInt8ArrayToBase64(sodium.crypto_sign_detached(message, groupSecretKey)),
  };
}

// this is kind of duplicated with `generateUpdateExpirySignature`, but needs to use the authData when secretKey is not available
async function generateUpdateExpiryGroupSignature({
  shortenOrExtend,
  timestamp,
  messagesHashes,
  group,
}: WithMessagesHashes &
  WithShortenOrExtend &
  WithTimestamp & {
    group: GroupDetailsNeededForSignature | null;
  }) {
  if (!group || isEmpty(group.pubkeyHex)) {
    throw new PreConditionFailed('generateUpdateExpiryGroupSignature groupPk is empty');
  }

  // "expire" || ShortenOrExtend || expiry || messages[0] || ... || messages[N]
  const verificationString = `expire${shortenOrExtend}${timestamp}${messagesHashes.join('')}`;
  const verificationData = StringUtils.encode(verificationString, 'utf8');
  const message = new Uint8Array(verificationData);

  if (!group) {
    throw new Error('generateUpdateExpiryGroupSignature group was not found');
  }
  const { pubkeyHex: groupPk, secretKey, authData } = group;

  const groupSecretKey = secretKey && !isEmpty(secretKey) ? secretKey : null;
  const groupAuthData = authData && !isEmpty(authData) ? authData : null;
  if (!groupSecretKey && !groupAuthData) {
    throw new Error(`retrieveRequestForGroup: needs either groupSecretKey or authData`);
  }

  const sodium = await getSodiumRenderer();
  const shared = { timestamp, pubkey: groupPk };

  if (groupSecretKey) {
    return {
      signature: fromUInt8ArrayToBase64(sodium.crypto_sign_detached(message, groupSecretKey)),
      ...shared,
    };
  }

  if (groupAuthData) {
    const subaccountSign = await MetaGroupWrapperActions.swarmSubaccountSign(
      groupPk,
      message,
      groupAuthData
    );
    return {
      ...subaccountSign,
      ...shared,
    };
  }

  throw new Error(`generateUpdateExpiryGroupSignature: needs either groupSecretKey or authData`);
}

async function getGroupSignatureByHashesParams({
  messagesHashes,
  method,
  pubkey,
}: WithMessagesHashes & {
  pubkey: GroupPubkeyType;
  method: 'delete';
}) {
  const verificationData = StringUtils.encode(`${method}${messagesHashes.join('')}`, 'utf8');
  const message = new Uint8Array(verificationData);

  const sodium = await getSodiumRenderer();
  try {
    const group = await UserGroupsWrapperActions.getGroup(pubkey);
    if (!group || !group.secretKey || isEmpty(group.secretKey)) {
      throw new Error('getSnodeGroupSignatureByHashesParams needs admin secretKey');
    }
    const signature = sodium.crypto_sign_detached(message, group.secretKey);
    const signatureBase64 = fromUInt8ArrayToBase64(signature);

    return {
      signature: signatureBase64,
      pubkey,
      messages: messagesHashes,
    };
  } catch (e) {
    window.log.warn('getSnodeGroupSignatureByHashesParams failed with: ', e.message);
    throw e;
  }
}

export const SnodeGroupSignature = {
  generateUpdateExpiryGroupSignature,
  getGroupInviteMessage,
  getSnodeGroupSignature,
  getGroupSignatureByHashesParams,
  signDataWithAdminSecret,
};
