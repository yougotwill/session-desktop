import { GroupPubkeyType, PubkeyType } from 'libsession_util_nodejs';
import { isEmpty } from 'lodash';
import {
  SnodeNamespaces,
  SnodeNamespacesGroup,
  SnodeNamespacesGroupConfig,
  UserConfigNamespaces,
} from './namespaces';
import { SignedGroupHashesParams, SignedHashesParams } from './types';

export type SwarmForSubRequest = { method: 'get_swarm'; params: { pubkey: string } };

type WithRetrieveMethod = { method: 'retrieve' };
type WithMaxCountSize = { max_count?: number; max_size?: number };
type WithPubkeyAsString = { pubkey: string };
type WithPubkeyAsGroupPubkey = { pubkey: GroupPubkeyType };

type RetrieveAlwaysNeeded = {
  namespace: number;
  last_hash: string;
  timestamp?: number;
};

export type RetrievePubkeySubRequestType = WithRetrieveMethod & {
  params: {
    signature: string;
    pubkey_ed25519: string;
    namespace: number;
  } & RetrieveAlwaysNeeded &
    WithMaxCountSize &
    WithPubkeyAsString;
};

/** Those namespaces do not require to be authenticated for storing messages.
 *  -> 0 is used for our swarm, and anyone needs to be able to send message to us.
 *  -> -10 is used for legacy closed group and we do not have authentication for them yet (but we will with the new closed groups)
 *  -> others are currently unused
 *
 */
// type UnauthenticatedStoreNamespaces = -30 | -20 | -10 | 0 | 10 | 20 | 30;

export type RetrieveLegacyClosedGroupSubRequestType = WithRetrieveMethod & {
  params: {
    namespace: SnodeNamespaces.LegacyClosedGroup; // legacy closed groups retrieve are not authenticated because the clients do not have a shared key
  } & RetrieveAlwaysNeeded &
    WithMaxCountSize &
    WithPubkeyAsString;
};

export type RetrieveGroupAdminSubRequestType = WithRetrieveMethod & {
  params: {
    signature: string;
    namespace: SnodeNamespacesGroup;
  } & RetrieveAlwaysNeeded &
    WithMaxCountSize;
};

export type RetrieveGroupSubAccountSubRequestType = WithRetrieveMethod & {
  params: {
    namespace: SnodeNamespacesGroup;
    signature: string;
    subaccount: string;
    subaccount_sig: string;
  } & RetrieveAlwaysNeeded &
    WithMaxCountSize &
    WithPubkeyAsGroupPubkey;
};

export type RetrieveSubRequestType =
  | RetrieveLegacyClosedGroupSubRequestType
  | RetrievePubkeySubRequestType
  | RetrieveGroupAdminSubRequestType
  | UpdateExpiryOnNodeUserSubRequest
  | UpdateExpiryOnNodeGroupSubRequest
  | RetrieveGroupSubAccountSubRequestType;

/**
 * OXEND_REQUESTS
 */
export type OnsResolveSubRequest = {
  method: 'oxend_request';
  params: {
    endpoint: 'ons_resolve';
    params: {
      type: 0;
      name_hash: string; // base64EncodedNameHash
    };
  };
};

export type GetServiceNodesSubRequest = {
  method: 'oxend_request';
  params: {
    endpoint: 'get_service_nodes';
    params: {
      active_only: true;
      fields: {
        public_ip: true;
        storage_port: true;
        pubkey_x25519: true;
        pubkey_ed25519: true;
      };
    };
  };
};

type StoreOnNodeNormalParams = {
  pubkey: string;
  ttl: number;
  timestamp: number;
  data: string;
  namespace: number;
  // sig_timestamp?: number;
  signature?: string;
  pubkey_ed25519?: string;
};

type StoreOnNodeSubAccountParams = Pick<
  StoreOnNodeNormalParams,
  'data' | 'namespace' | 'ttl' | 'timestamp'
> & {
  pubkey: GroupPubkeyType;
  subaccount: string;
  subaccount_sig: string;
  namespace: SnodeNamespaces.ClosedGroupMessages; // this can only be this one, subaccounts holder can not post to something else atm
  signature: string; // signature is mandatory for subaccount
};

export type StoreOnNodeParams = StoreOnNodeNormalParams | StoreOnNodeSubAccountParams;

export type StoreOnNodeParamsNoSig = Pick<
  StoreOnNodeParams,
  'pubkey' | 'ttl' | 'timestamp' | 'ttl' | 'namespace'
> & { data64: string };

export type DeleteFromNodeWithTimestampParams = {
  timestamp: string | number;
  namespace: number | null | 'all';
} & (DeleteSigUserParameters | DeleteSigGroupParameters);

export type DeleteByHashesFromNodeParams = { messages: Array<string> } & (
  | DeleteSigUserParameters
  | DeleteSigGroupParameters
);

type StoreOnNodeShared = {
  networkTimestamp: number;
  data: Uint8Array;
  ttl: number;
};

type StoreOnNodeGroupConfig = StoreOnNodeShared & {
  pubkey: GroupPubkeyType;
  namespace: SnodeNamespacesGroupConfig;
};

type StoreOnNodeGroupMessage = StoreOnNodeShared & {
  pubkey: GroupPubkeyType;
  namespace: SnodeNamespaces.ClosedGroupMessages;
};

type StoreOnNodeUserConfig = StoreOnNodeShared & {
  pubkey: PubkeyType;
  namespace: UserConfigNamespaces;
};

export type StoreOnNodeData =
  | StoreOnNodeGroupConfig
  | StoreOnNodeUserConfig
  | StoreOnNodeGroupMessage;

export type StoreOnNodeSubRequest = {
  method: 'store';
  params: StoreOnNodeParams | StoreOnNodeSubAccountParams;
};
export type NetworkTimeSubRequest = { method: 'info'; params: object };

type DeleteSigUserParameters = {
  pubkey: PubkeyType;
  pubkey_ed25519: string;
  signature: string;
};

type DeleteSigGroupParameters = {
  pubkey: GroupPubkeyType;
  signature: string;
};

export type DeleteAllFromNodeSubRequest = {
  method: 'delete_all';
  params: DeleteFromNodeWithTimestampParams;
};

export type DeleteFromNodeSubRequest = {
  method: 'delete';
  params: DeleteByHashesFromNodeParams;
};

type UpdateExpireAlwaysNeeded = {
  messages: Array<string>;
  expiry: number;
  signature: string;
  extend?: boolean;
  shorten?: boolean;
};

export type UpdateExpireNodeUserParams = WithPubkeyAsString &
  UpdateExpireAlwaysNeeded & {
    pubkey_ed25519: string;
  };

export type UpdateExpireNodeGroupParams = WithPubkeyAsGroupPubkey & UpdateExpireAlwaysNeeded;

export type UpdateExpiryOnNodeUserSubRequest = {
  method: 'expire';
  params: UpdateExpireNodeUserParams;
};

export type UpdateExpiryOnNodeGroupSubRequest = {
  method: 'expire';
  params: UpdateExpireNodeGroupParams;
};

type UpdateExpiryOnNodeSubRequest =
  | UpdateExpiryOnNodeUserSubRequest
  | UpdateExpiryOnNodeGroupSubRequest;

type SignedRevokeSubaccountShared = {
  pubkey: GroupPubkeyType;
  signature: string;
  timestamp: number;
};

export type SignedRevokeSubaccountParams = SignedRevokeSubaccountShared & {
  revoke: Array<string>; // the subaccounts token to revoke in hex
};

export type SignedUnrevokeSubaccountParams = SignedRevokeSubaccountShared & {
  unrevoke: Array<string>; // the subaccounts token to unrevoke in hex
};

export type RevokeSubaccountParams = Omit<SignedRevokeSubaccountParams, 'timestamp' | 'signature'>;
export type UnrevokeSubaccountParams = Omit<
  SignedUnrevokeSubaccountParams,
  'timestamp' | 'signature'
>;

export type RevokeSubaccountSubRequest = {
  method: 'revoke_subaccount';
  params: SignedRevokeSubaccountParams;
};

export type UnrevokeSubaccountSubRequest = {
  method: 'unrevoke_subaccount';
  params: SignedUnrevokeSubaccountParams;
};

export type GetExpiriesNodeParams = {
  pubkey: string;
  pubkey_ed25519: string;
  messages: Array<string>;
  timestamp: number;
  signature: string;
};

export type GetExpiriesFromNodeSubRequest = {
  method: 'get_expiries';
  params: GetExpiriesNodeParams;
};

// Until the next storage server release is released, we need to have at least 2 hashes in the list for the `get_expiries` AND for the `update_expiries`
export const fakeHash = '///////////////////////////////////////////';

export type OxendSubRequest = OnsResolveSubRequest | GetServiceNodesSubRequest;

export type SnodeApiSubRequests =
  | RetrieveSubRequestType
  | SwarmForSubRequest
  | OxendSubRequest
  | StoreOnNodeSubRequest
  | NetworkTimeSubRequest
  | DeleteFromNodeSubRequest
  | DeleteAllFromNodeSubRequest
  | UpdateExpiryOnNodeSubRequest
  | RevokeSubaccountSubRequest
  | UnrevokeSubaccountSubRequest
  | GetExpiriesFromNodeSubRequest;

// eslint-disable-next-line @typescript-eslint/array-type
export type NonEmptyArray<T> = [T, ...T[]];

export type BatchResultEntry = {
  code: number;
  body: Record<string, any>;
};

export type NotEmptyArrayOfBatchResults = NonEmptyArray<BatchResultEntry>;

export type WithShortenOrExtend = { shortenOrExtend: 'shorten' | 'extend' | '' };

export const MAX_SUBREQUESTS_COUNT = 20;

export type BatchStoreWithExtraParams =
  | StoreOnNodeParams
  | SignedGroupHashesParams
  | SignedHashesParams
  | RevokeSubaccountSubRequest
  | UnrevokeSubaccountSubRequest;

export function isUnrevokeRequest(
  request: BatchStoreWithExtraParams
): request is UnrevokeSubaccountSubRequest {
  return !isEmpty((request as UnrevokeSubaccountSubRequest)?.params?.unrevoke);
}

export function isRevokeRequest(
  request: BatchStoreWithExtraParams
): request is RevokeSubaccountSubRequest {
  return !isEmpty((request as RevokeSubaccountSubRequest)?.params?.revoke);
}

export function isDeleteByHashesParams(
  request: BatchStoreWithExtraParams
): request is SignedGroupHashesParams | SignedHashesParams {
  return !isEmpty((request as SignedGroupHashesParams | SignedHashesParams)?.messages);
}
