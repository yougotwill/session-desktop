import { GroupPubkeyType, PubkeyType } from 'libsession_util_nodejs';
import {
  SnodeNamespaces,
  SnodeNamespacesGroup,
  SnodeNamespacesGroupConfig,
  UserConfigNamespaces,
} from './namespaces';

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
} & DeleteSigParameters;
export type DeleteByHashesFromNodeParams = { messages: Array<string> } & DeleteSigParameters;

type StoreOnNodeShared = {
  networkTimestamp: number;
  data: Uint8Array;
  ttl: number;
};

type StoreOnNodeGroupConfig = StoreOnNodeShared & {
  pubkey: GroupPubkeyType;
  namespace: SnodeNamespacesGroupConfig;
};

type StoreOnNodeUserConfig = StoreOnNodeShared & {
  pubkey: PubkeyType;
  namespace: UserConfigNamespaces;
};

export type StoreOnNodeData = StoreOnNodeGroupConfig | StoreOnNodeUserConfig;

export type StoreOnNodeSubRequest = {
  method: 'store';
  params: StoreOnNodeParams | StoreOnNodeSubAccountParams;
};
export type NetworkTimeSubRequest = { method: 'info'; params: object };

type DeleteSigParameters = {
  pubkey: string;
  pubkey_ed25519: string;
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

export type RevokeSubaccountParams = {
  pubkey: GroupPubkeyType;
  revoke: string; // the subaccount token to revoke in hex
  signature: string;
};
export type RevokeSubaccountSubRequest = {
  method: 'revoke_subaccount' | 'unrevoke_subaccount';
  params: RevokeSubaccountParams;
};

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
  | RevokeSubaccountSubRequest;

// eslint-disable-next-line @typescript-eslint/array-type
export type NonEmptyArray<T> = [T, ...T[]];

export type BatchResultEntry = {
  code: number;
  body: Record<string, any>;
};
export type NotEmptyArrayOfBatchResults = NonEmptyArray<BatchResultEntry>;
