import { GroupPubkeyType } from 'libsession_util_nodejs';
import { from_hex } from 'libsodium-wrappers-sumo';
import _ from 'lodash';
import { doSnodeBatchRequest } from './batchRequest';

import { concatUInt8Array } from '../../crypto';
import { PubKey } from '../../types';
import { StringUtils } from '../../utils';
import { RevokeSubaccountSubRequest, UnrevokeSubaccountSubRequest } from './SnodeRequestTypes';
import { GetNetworkTime } from './getNetworkTime';
import { SnodeGroupSignature } from './signature/groupSignature';
import { getSwarmFor } from './snodePool';

export type RevokeChanges = Array<{
  action: 'revoke_subaccount' | 'unrevoke_subaccount';
  tokenToRevokeHex: string;
}>;

async function getRevokeSubaccountRequest({
  groupPk,
  revokeChanges,
  groupSecretKey,
}: {
  groupPk: GroupPubkeyType;
  groupSecretKey: Uint8Array;
  revokeChanges: RevokeChanges;
}): Promise<Array<RevokeSubaccountSubRequest | UnrevokeSubaccountSubRequest>> {
  if (!PubKey.is03Pubkey(groupPk)) {
    throw new Error('revokeSubaccountForGroup: not a 03 group');
  }

  const timestamp = GetNetworkTime.getNowWithNetworkOffset();

  const revokeParams: Array<RevokeSubaccountSubRequest | UnrevokeSubaccountSubRequest> =
    await Promise.all(
      revokeChanges.map(async change => {
        const tokenBytes = from_hex(change.tokenToRevokeHex);

        const prefix = new Uint8Array(StringUtils.encode(`${change.action}${timestamp}`, 'utf8'));
        const sigResult = await SnodeGroupSignature.signDataWithAdminSecret(
          concatUInt8Array(prefix, tokenBytes),
          { secretKey: groupSecretKey }
        );

        const args =
          change.action === 'revoke_subaccount'
            ? {
                method: change.action,
                params: {
                  revoke: change.tokenToRevokeHex,
                  ...sigResult,
                  pubkey: groupPk,
                  timestamp,
                },
              }
            : {
                method: change.action,
                params: {
                  unrevoke: change.tokenToRevokeHex,
                  ...sigResult,
                  pubkey: groupPk,
                  timestamp,
                },
              };

        return args;
      })
    );

  return revokeParams;
}

async function revokeSubAccounts(
  groupPk: GroupPubkeyType,
  revokeChanges: RevokeChanges,
  groupSecretKey: Uint8Array
): Promise<boolean> {
  try {
    const swarm = await getSwarmFor(groupPk);
    const snode = _.sample(swarm);
    if (!snode) {
      throw new Error('revoke subaccounts empty swarm');
    }
    const revokeParams = await getRevokeSubaccountRequest({
      groupPk,
      revokeChanges,
      groupSecretKey,
    });

    const results = await doSnodeBatchRequest(revokeParams, snode, 7000, null);

    if (!results || !results.length) {
      throw new Error(`_revokeSubAccounts could not talk to ${snode.ip}:${snode.port}`);
    }
    return true;
  } catch (e) {
    window?.log?.warn(`_revokeSubAccounts  failed with ${e.message}`);
    return false;
  }
}

export const SnodeAPIRevoke = { revokeSubAccounts };
