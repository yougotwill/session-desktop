import { GroupPubkeyType } from 'libsession_util_nodejs';

import { PubKey } from '../../types';

export type RevokeChanges = Array<{
  action: 'revoke_subaccount' | 'unrevoke_subaccount';
  tokenToRevokeHex: string;
}>;

async function getRevokeSubaccountParams(
  groupPk: GroupPubkeyType,
  _secretKey: Uint8Array,
  _opts: { revokeChanges: RevokeChanges; unrevokeChanges: RevokeChanges }
) {
  if (!PubKey.is03Pubkey(groupPk)) {
    throw new Error('revokeSubaccountForGroup: not a 03 group');
  }

  window.log.warn('getRevokeSubaccountParams to enable once multisig is done'); // TODO audric debugger

  // const revokeSubRequest = revokeChanges.length
  //   ? new SubaccountRevokeSubRequest({
  //       groupPk,
  //       revokeTokenHex: revokeChanges.map(m => m.tokenToRevokeHex),
  //       timestamp: GetNetworkTime.now(),
  //       secretKey,
  //     })
  //   : null;
  // const unrevokeSubRequest = unrevokeChanges.length
  //   ? new SubaccountUnrevokeSubRequest({
  //       groupPk,
  //       revokeTokenHex: unrevokeChanges.map(m => m.tokenToRevokeHex),
  //       timestamp: GetNetworkTime.now(),
  //       secretKey,
  //     })
  //   : null;

  return {
    revokeSubRequest: null,
    unrevokeSubRequest: null,
  };
}

export const SnodeAPIRevoke = { getRevokeSubaccountParams };
