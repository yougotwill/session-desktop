import { GroupPubkeyType, PubkeyType, WithGroupPubkey } from 'libsession_util_nodejs';
import { from_hex } from 'libsodium-wrappers-sumo';
import { isEmpty } from 'lodash';
import { concatUInt8Array } from '../../crypto';
import { StringUtils, UserUtils } from '../../utils';
import { GetNetworkTime } from './getNetworkTime';
import {
  SnodeNamespaces,
  SnodeNamespacesGroup,
  SnodeNamespacesGroupConfig,
  UserConfigNamespaces,
} from './namespaces';
import { SnodeGroupSignature } from './signature/groupSignature';
import { SnodeSignature } from './signature/snodeSignatures';
import {
  SignedGroupHashesParams,
  SignedHashesParams,
  WithMessagesHashes,
  WithSecretKey,
  WithSignature,
  WithTimestamp,
} from './types';

type WithRetrieveMethod = { method: 'retrieve' };
type WithMaxCountSize = { max_count?: number; max_size?: number };
type WithPubkeyAsString = { pubkey: string };
type WithPubkeyAsGroupPubkey = { pubkey: GroupPubkeyType };
export type WithShortenOrExtend = { shortenOrExtend: 'shorten' | 'extend' | '' };

type RetrieveAlwaysNeeded = {
  namespace: number;
  last_hash: string;
  timestamp?: number;
};

export type RetrievePubkeySubRequestType = WithRetrieveMethod & {
  params: {
    pubkey_ed25519: string;
    namespace: number;
  } & RetrieveAlwaysNeeded &
    WithMaxCountSize &
    WithPubkeyAsString &
    WithSignature;
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
    namespace: SnodeNamespacesGroup;
  } & RetrieveAlwaysNeeded &
    WithMaxCountSize &
    WithSignature;
};

export type RetrieveGroupSubAccountSubRequestType = WithRetrieveMethod & {
  params: {
    namespace: SnodeNamespacesGroup;
    subaccount: string;
    subaccount_sig: string;
  } & RetrieveAlwaysNeeded &
    WithMaxCountSize &
    WithPubkeyAsGroupPubkey &
    WithSignature;
};

export type RetrieveSubRequestType =
  | RetrieveLegacyClosedGroupSubRequestType
  | RetrievePubkeySubRequestType
  | RetrieveGroupAdminSubRequestType
  | UpdateExpiryOnNodeUserSubRequest
  | UpdateExpiryOnNodeGroupSubRequest
  | RetrieveGroupSubAccountSubRequestType;

abstract class SnodeAPISubRequest {
  public abstract method: string;
}

export class OnsResolveSubRequest extends SnodeAPISubRequest {
  public method: string = 'oxend_request';
  public readonly base64EncodedNameHash: string;

  constructor(base64EncodedNameHash: string) {
    super();
    this.base64EncodedNameHash = base64EncodedNameHash;
  }

  public build() {
    return {
      method: this.method,
      params: {
        endpoint: 'ons_resolve',
        params: {
          type: 0,
          name_hash: this.base64EncodedNameHash,
        },
      },
    };
  }
}

export class GetServiceNodesSubRequest extends SnodeAPISubRequest {
  public method = 'oxend_request' as const;

  public build() {
    return {
      method: this.method,
      params: {
        endpoint: 'get_service_nodes' as const,
        params: {
          active_only: true,
          fields: {
            public_ip: true,
            storage_port: true,
            pubkey_x25519: true,
            pubkey_ed25519: true,
          },
        },
      },
    };
  }
}

export class SwarmForSubRequest extends SnodeAPISubRequest {
  public method = 'get_swarm' as const;
  public readonly pubkey;

  constructor(pubkey: PubkeyType | GroupPubkeyType) {
    super();
    this.pubkey = pubkey;
  }

  public build() {
    return {
      method: this.method,
      params: {
        pubkey: this.pubkey,
        params: {
          active_only: true,
          fields: {
            public_ip: true,
            storage_port: true,
            pubkey_x25519: true,
            pubkey_ed25519: true,
          },
        },
      },
    } as const;
  }
}

export class NetworkTimeSubRequest extends SnodeAPISubRequest {
  public method = 'info' as const;

  public build() {
    return {
      method: this.method,
      params: {},
    } as const;
  }
}

abstract class SubaccountRightsSubRequest extends SnodeAPISubRequest {
  public readonly groupPk: GroupPubkeyType;
  public readonly timestamp: number;
  public readonly revokeTokenHex: Array<string>;

  protected readonly secretKey: Uint8Array;

  constructor({
    groupPk,
    timestamp,
    revokeTokenHex,
    secretKey,
  }: WithGroupPubkey & WithTimestamp & WithSecretKey & { revokeTokenHex: Array<string> }) {
    super();
    this.groupPk = groupPk;
    this.timestamp = timestamp;
    this.revokeTokenHex = revokeTokenHex;
    this.secretKey = secretKey;
  }

  public async sign() {
    if (!this.secretKey) {
      throw new Error('we need an admin secretkey');
    }
    const tokensBytes = from_hex(this.revokeTokenHex.join(''));

    const prefix = new Uint8Array(StringUtils.encode(`${this.method}${this.timestamp}`, 'utf8'));
    const sigResult = await SnodeGroupSignature.signDataWithAdminSecret(
      concatUInt8Array(prefix, tokensBytes),
      { secretKey: this.secretKey }
    );

    return sigResult.signature;
  }
}

export class SubaccountRevokeSubRequest extends SubaccountRightsSubRequest {
  public method = 'revoke_subaccount' as const;

  public async buildAndSignParameters() {
    const signature = await this.sign();
    return {
      method: this.method,
      params: {
        pubkey: this.groupPk,
        signature,
        revoke: this.revokeTokenHex,
        timestamp: this.timestamp,
      },
    };
  }
}

export class SubaccountUnrevokeSubRequest extends SubaccountRightsSubRequest {
  public method = 'unrevoke_subaccount' as const;

  /**
   * For Revoke/unrevoke, this needs an admin signature
   */
  public async buildAndSignParameters() {
    const signature = await this.sign();

    return {
      method: this.method,
      params: {
        pubkey: this.groupPk,
        signature,
        unrevoke: this.revokeTokenHex,
        timestamp: this.timestamp,
      },
    };
  }
}

/**
 * The getExpiriies request can currently only be used for our own pubkey as we use it to fetch
 * the expiries updated by another of our devices.
 */
export class GetExpiriesFromNodeSubRequest extends SnodeAPISubRequest {
  public method = 'get_expiries' as const;
  pubkey: string;
  messageHashes: Array<string>;

  constructor(args: WithMessagesHashes) {
    super();
    const ourPubKey = UserUtils.getOurPubKeyStrFromCache();
    if (!ourPubKey) {
      throw new Error('[GetExpiriesFromNodeSubRequest] No pubkey found');
    }
    this.pubkey = ourPubKey;
    this.messageHashes = args.messagesHashes;
  }
  /**
   * For Revoke/unrevoke, this needs an admin signature
   */
  public async buildAndSignParameters() {
    const timestamp = GetNetworkTime.now();

    const signResult = await SnodeSignature.generateGetExpiriesOurSignature({
      timestamp,
      messageHashes: this.messageHashes,
    });

    if (!signResult) {
      throw new Error(
        `[GetExpiriesFromNodeSubRequest] SnodeSignature.generateUpdateExpirySignature returned an empty result ${this.messageHashes}`
      );
    }

    return {
      method: this.method,
      params: {
        pubkey: this.pubkey,
        pubkey_ed25519: signResult.pubkey_ed25519.toUpperCase(),
        signature: signResult.signature,
        messages: this.messageHashes,
        timestamp,
      },
    };
  }
}

/**
 * STORE SUBREQUESTS
 */
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
> &
  WithSignature & {
    pubkey: GroupPubkeyType;
    subaccount: string;
    subaccount_sig: string;
    namespace: SnodeNamespaces.ClosedGroupMessages; // this can only be this one, subaccounts holder can not post to something else atm
    // signature is mandatory for subaccount
  };

export type StoreOnNodeParams = StoreOnNodeNormalParams | StoreOnNodeSubAccountParams;

export type StoreOnNodeParamsNoSig = Pick<
  StoreOnNodeParams,
  'pubkey' | 'ttl' | 'timestamp' | 'ttl' | 'namespace'
> & { data64: string };

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

/**
 * DELETE SUBREQUESTS
 */

type DeleteFromNodeWithTimestampParams = {
  timestamp: string | number;
  namespace: number | null | 'all';
} & (DeleteSigUserParameters | DeleteSigGroupParameters);

export type DeleteByHashesFromNodeParams = { messages: Array<string> } & (
  | DeleteSigUserParameters
  | DeleteSigGroupParameters
);

type DeleteSigUserParameters = WithSignature & {
  pubkey: PubkeyType;
  pubkey_ed25519: string;
};

type DeleteSigGroupParameters = WithSignature & {
  pubkey: GroupPubkeyType;
};

export type DeleteAllFromNodeSubRequest = {
  method: 'delete_all';
  params: DeleteFromNodeWithTimestampParams;
};

export type DeleteFromNodeSubRequest = {
  method: 'delete';
  params: DeleteByHashesFromNodeParams;
};

type UpdateExpireAlwaysNeeded = WithSignature & {
  messages: Array<string>;
  expiry: number;
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

// Until the next storage server release is released, we need to have at least 2 hashes in the list for the `get_expiries` AND for the `update_expiries`
export const fakeHash = '///////////////////////////////////////////';

export type SnodeApiSubRequests =
  | RetrieveSubRequestType
  | ReturnType<SwarmForSubRequest['build']>
  | ReturnType<OnsResolveSubRequest['build']>
  | ReturnType<GetServiceNodesSubRequest['build']>
  | StoreOnNodeSubRequest
  | ReturnType<NetworkTimeSubRequest['build']>
  | DeleteFromNodeSubRequest
  | DeleteAllFromNodeSubRequest
  | UpdateExpiryOnNodeSubRequest
  | Awaited<ReturnType<SubaccountRevokeSubRequest['buildAndSignParameters']>>
  | Awaited<ReturnType<SubaccountUnrevokeSubRequest['buildAndSignParameters']>>
  | Awaited<ReturnType<GetExpiriesFromNodeSubRequest['buildAndSignParameters']>>;

// eslint-disable-next-line @typescript-eslint/array-type
export type NonEmptyArray<T> = [T, ...T[]];

export type BatchResultEntry = {
  code: number;
  body: Record<string, any>;
};

export type NotEmptyArrayOfBatchResults = NonEmptyArray<BatchResultEntry>;

export const MAX_SUBREQUESTS_COUNT = 20;

export type BatchStoreWithExtraParams =
  | StoreOnNodeParams
  | SignedGroupHashesParams
  | SignedHashesParams
  | SubaccountRevokeSubRequest
  | SubaccountUnrevokeSubRequest;

export function isDeleteByHashesParams(
  request: BatchStoreWithExtraParams
): request is SignedGroupHashesParams | SignedHashesParams {
  return !isEmpty((request as SignedGroupHashesParams | SignedHashesParams)?.messages);
}
