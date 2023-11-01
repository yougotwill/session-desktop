import { GroupPubkeyType } from 'libsession_util_nodejs';
import _, { isEmpty } from 'lodash';
import { doSnodeBatchRequest } from './batchRequest';

import { UserGroupsWrapperActions } from '../../../webworker/workers/browser/libsession_worker_interface';
import { PubKey } from '../../types';
import { stringToUint8Array } from '../../utils/String';
import { RevokeSubaccountSubRequest } from './SnodeRequestTypes';
import { SnodeGroupSignature } from './signature/groupSignature';
import { getSwarmFor } from './snodePool';

type Change = {
  action: 'revoke_subaccount' | 'unrevoke_subaccount';
  tokenToRevoke: string;
};

type ArrayOfChange = Array<Change>;
async function getRevokeSubaccountRequest({
  groupPk,
  actions,
}: {
  groupPk: GroupPubkeyType;
  actions: ArrayOfChange;
}): Promise<Array<RevokeSubaccountSubRequest>> {
  if (!PubKey.isClosedGroupV2(groupPk)) {
    throw new Error('revokeSubaccountForGroup: not a 03 group');
  }

  const group = await UserGroupsWrapperActions.getGroup(groupPk);

  if (!group || isEmpty(group?.secretKey)) {
    throw new Error(`revokeSubaccountForGroup ${groupPk} needs admin secretkey`);
  }

  const revokeParams: Array<RevokeSubaccountSubRequest> = await Promise.all(
    actions.map(async action => {
      const verificationString = `${action}${stringToUint8Array(action.tokenToRevoke)}`;
      const sigResult = await SnodeGroupSignature.signDataWithAdminSecret(
        verificationString,
        group
      );

      return {
        method: action.action,
        params: {
          revoke: action.tokenToRevoke,
          ...sigResult,
          pubkey: groupPk,
        },
      };
    })
  );

  return revokeParams;
}

async function revokeSubAccounts(
  groupPk: GroupPubkeyType,
  actions: ArrayOfChange
): Promise<boolean> {
  try {
    const swarm = await getSwarmFor(groupPk);
    const snode = _.sample(swarm);
    if (!snode) {
      throw new Error('revoke subaccounts empty swarm');
    }
    const revokeParams = await getRevokeSubaccountRequest({
      groupPk,
      actions,
    });

    const results = await doSnodeBatchRequest(revokeParams, snode, 4000, null);

    if (!results || !results.length) {
      throw new Error(`_revokeSubAccounts could not talk to ${snode.ip}:${snode.port}`);
    }
    return true;
  } catch (e) {
    window?.log?.warn(`_revokeSubAccounts  failed with ${e.message}`);
    return false;
  }
}

export const SnodeAPIRetrieve = { revokeSubAccounts };
