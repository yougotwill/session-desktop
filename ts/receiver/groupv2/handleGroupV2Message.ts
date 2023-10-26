import { isEmpty } from 'lodash';
import { ConversationTypeEnum } from '../../models/conversationAttributes';
import { HexString } from '../../node/hexStrings';
import { SignalService } from '../../protobuf';
import { getSwarmPollingInstance } from '../../session/apis/snode_api';
import { ConvoHub } from '../../session/conversations';
import { PubKey } from '../../session/types';
import { UserUtils } from '../../session/utils';
import { LibSessionUtil } from '../../session/utils/libsession/libsession_utils';
import { toFixedUint8ArrayOfLength } from '../../types/sqlSharedTypes';
import {
  MetaGroupWrapperActions,
  UserGroupsWrapperActions,
} from '../../webworker/workers/browser/libsession_worker_interface';

type WithEnvelopeTimestamp = { envelopeTimestamp: number };

type GroupInviteDetails = {
  inviteMessage: SignalService.GroupUpdateInviteMessage;
} & WithEnvelopeTimestamp;

type GroupUpdateDetails = {
  updateMessage: SignalService.GroupUpdateMessage;
} & WithEnvelopeTimestamp;

async function handleGroupInviteMessage({ inviteMessage, envelopeTimestamp }: GroupInviteDetails) {
  if (!PubKey.isClosedGroupV2(inviteMessage.groupSessionId)) {
    // invite to a group which has not a 03 prefix, we can just drop it.
    return;
  }
  // TODO verify sig invite adminSignature
  const convo = await ConvoHub.use().getOrCreateAndWait(
    inviteMessage.groupSessionId,
    ConversationTypeEnum.GROUPV2
  );
  convo.set({
    active_at: envelopeTimestamp,
    didApproveMe: true,
  });

  if (inviteMessage.name && isEmpty(convo.getRealSessionUsername())) {
    convo.set({
      displayNameInProfile: inviteMessage.name,
    });
  }
  await convo.commit();

  let found = await UserGroupsWrapperActions.getGroup(inviteMessage.groupSessionId);
  if (!found) {
    found = {
      authData: null,
      joinedAtSeconds: Date.now(),
      name: inviteMessage.name,
      priority: 0,
      pubkeyHex: inviteMessage.groupSessionId,
      secretKey: null,
    };
  }
  // not sure if we should drop it, or set it again? They should be the same anyway
  found.authData = inviteMessage.memberAuthData;

  const userEd25519Secretkey = (await UserUtils.getUserED25519KeyPairBytes()).privKeyBytes;
  await UserGroupsWrapperActions.setGroup(found);
  await MetaGroupWrapperActions.init(inviteMessage.groupSessionId, {
    metaDumped: null,
    groupEd25519Secretkey: null,
    userEd25519Secretkey: toFixedUint8ArrayOfLength(userEd25519Secretkey, 64).buffer,
    groupEd25519Pubkey: toFixedUint8ArrayOfLength(
      HexString.fromHexString(inviteMessage.groupSessionId.slice(2)),
      32
    ).buffer,
  });
  await LibSessionUtil.saveDumpsToDb(UserUtils.getOurPubKeyStrFromCache());

  // TODO use the pending so we actually don't start polling here unless it is not in the pending state.
  // once everything is ready, start polling using that authData to get the keys, members, details of that group, and its messages.
  getSwarmPollingInstance().addGroupId(inviteMessage.groupSessionId);
}

async function handleGroupUpdateMessage(args: GroupUpdateDetails) {
  if (args.updateMessage.inviteMessage) {
    await handleGroupInviteMessage({
      inviteMessage: args.updateMessage.inviteMessage as SignalService.GroupUpdateInviteMessage,
      ...args,
    });
    return;
  }
}

export const GroupV2Receiver = { handleGroupUpdateMessage };
