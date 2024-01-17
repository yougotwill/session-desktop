import { GroupPubkeyType } from 'libsession_util_nodejs';

import { PubKey } from '../../types';
import { RevokeSubaccountParams, UnrevokeSubaccountParams } from './SnodeRequestTypes';

export type RevokeChanges = Array<{
  action: 'revoke_subaccount' | 'unrevoke_subaccount';
  tokenToRevokeHex: string;
}>;

async function getRevokeSubaccountParams(
  groupPk: GroupPubkeyType,
  {
    revokeChanges,
    unrevokeChanges,
  }: { revokeChanges: RevokeChanges; unrevokeChanges: RevokeChanges }
) {
  if (!PubKey.is03Pubkey(groupPk)) {
    throw new Error('revokeSubaccountForGroup: not a 03 group');
  }

  const revokeParams: RevokeSubaccountParams | null = revokeChanges.length
    ? {
        pubkey: groupPk,
        revoke: revokeChanges.map(m => m.tokenToRevokeHex),
      }
    : null;

  const unrevokeParams: UnrevokeSubaccountParams | null = unrevokeChanges.length
    ? {
        pubkey: groupPk,
        unrevoke: unrevokeChanges.map(m => m.tokenToRevokeHex),
      }
    : null;

  return {
    revokeParams,
    unrevokeParams,
  };
}

export const SnodeAPIRevoke = { getRevokeSubaccountParams };
