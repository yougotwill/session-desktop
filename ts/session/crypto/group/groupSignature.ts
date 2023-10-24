import { GroupMemberGet, GroupPubkeyType, Uint8ArrayLen64 } from 'libsession_util_nodejs';
import { compact } from 'lodash';
import { MetaGroupWrapperActions } from '../../../webworker/workers/browser/libsession_worker_interface';
import { GetNetworkTime } from '../../apis/snode_api/getNetworkTime';
import { GroupUpdateInviteMessage } from '../../messages/outgoing/controlMessage/group_v2/to_user/GroupUpdateInviteMessage';
import { UserUtils } from '../../utils';
import { getSodiumRenderer } from '../MessageEncrypter';

export async function getGroupInvitesMessages({
  groupName,
  membersFromWrapper,
  secretKey,
  groupPk,
}: {
  membersFromWrapper: Array<GroupMemberGet>;
  groupName: string;
  secretKey: Uint8ArrayLen64; // len 64
  groupPk: GroupPubkeyType;
}) {
  const sodium = await getSodiumRenderer();
  const timestamp = GetNetworkTime.getNowWithNetworkOffset();

  const inviteDetails = compact(
    await Promise.all(
      membersFromWrapper.map(async ({ pubkeyHex: member }) => {
        if (UserUtils.isUsFromCache(member)) {
          return null;
        }
        const tosign = `INVITE${member}${timestamp}`;

        // Note: as the signature is built with the timestamp here, we cannot override the timestamp later on the sending pipeline
        const adminSignature = sodium.crypto_sign_detached(tosign, secretKey);
        console.info(`before makeSwarmSubAccount ${groupPk}:${member}`);
        const memberAuthData = await MetaGroupWrapperActions.makeSwarmSubAccount(groupPk, member);
        debugger;
        console.info(`after makeSwarmSubAccount ${groupPk}:${member}`);

        const invite = new GroupUpdateInviteMessage({
          groupName,
          groupPk,
          timestamp,
          adminSignature,
          memberAuthData,
        });

        return { member, invite };
      })
    )
  );
  return inviteDetails;
}
