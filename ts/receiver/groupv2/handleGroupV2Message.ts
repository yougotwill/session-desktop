import { PubkeyType, WithGroupPubkey } from 'libsession_util_nodejs';
import { isEmpty } from 'lodash';
import { ConversationTypeEnum } from '../../models/conversationAttributes';
import { HexString } from '../../node/hexStrings';
import { SignalService } from '../../protobuf';
import { getSwarmPollingInstance } from '../../session/apis/snode_api';
import { ConvoHub } from '../../session/conversations';
import { ClosedGroup } from '../../session/group/closed-group';
import { ed25519Str } from '../../session/onions/onionPath';
import { PubKey } from '../../session/types';
import { UserUtils } from '../../session/utils';
import { LibSessionUtil } from '../../session/utils/libsession/libsession_utils';
import { toFixedUint8ArrayOfLength } from '../../types/sqlSharedTypes';
import {
  MetaGroupWrapperActions,
  UserGroupsWrapperActions,
} from '../../webworker/workers/browser/libsession_worker_interface';

type WithEnvelopeTimestamp = { envelopeTimestamp: number };
type WithAuthor = { author: PubkeyType };

type WithUncheckedSource = { source: string };
type WithUncheckedSenderIdentity = { senderIdentity: string };

type GroupInviteDetails = {
  inviteMessage: SignalService.GroupUpdateInviteMessage;
} & WithEnvelopeTimestamp &
  WithAuthor;

type GroupMemberChangeDetails = {
  memberChangeDetails: SignalService.GroupUpdateMemberChangeMessage;
} & WithEnvelopeTimestamp &
  WithGroupPubkey &
  WithAuthor;

type GroupUpdateDetails = {
  updateMessage: SignalService.GroupUpdateMessage;
} & WithEnvelopeTimestamp;

async function handleGroupInviteMessage({
  inviteMessage,
  author,
  envelopeTimestamp,
}: GroupInviteDetails) {
  if (!PubKey.is03Pubkey(inviteMessage.groupSessionId)) {
    // invite to a group which has not a 03 prefix, we can just drop it.
    return;
  }
  window.log.debug(
    `received invite to group ${ed25519Str(inviteMessage.groupSessionId)} by user:${ed25519Str(
      author
    )}`
  );
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

async function handleGroupMemberChangeMessage({
  memberChangeDetails,
  groupPk,
  envelopeTimestamp,
  author,
}: GroupMemberChangeDetails) {
  if (!PubKey.is03Pubkey(groupPk)) {
    // invite to a group which has not a 03 prefix, we can just drop it.
    return;
  }
  // TODO verify sig invite adminSignature
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    return;
  }

  switch (memberChangeDetails.type) {
    case SignalService.GroupUpdateMemberChangeMessage.Type.ADDED: {
      await ClosedGroup.addUpdateMessage(
        convo,
        { joiningMembers: memberChangeDetails.memberSessionIds },
        author,
        envelopeTimestamp
      );

      break;
    }
    case SignalService.GroupUpdateMemberChangeMessage.Type.REMOVED: {
      await ClosedGroup.addUpdateMessage(
        convo,
        { kickedMembers: memberChangeDetails.memberSessionIds },
        author,
        envelopeTimestamp
      );
      break;
    }
    case SignalService.GroupUpdateMemberChangeMessage.Type.PROMOTED: {
      await ClosedGroup.addUpdateMessage(
        convo,
        { promotedMembers: memberChangeDetails.memberSessionIds },
        author,
        envelopeTimestamp
      );
      break;
    }
    default:
      return;
  }

  convo.set({
    active_at: envelopeTimestamp,
    didApproveMe: true,
  });
}

async function handleGroupUpdateMessage(
  details: GroupUpdateDetails & WithUncheckedSource & WithUncheckedSenderIdentity
) {
  if (details.updateMessage.inviteMessage) {
    // the invite message is received from our own swarm, so source is the sender, and senderIdentity is empty
    const author = details.source;
    if (!PubKey.is05Pubkey(author)) {
      window.log.warn('received group inviteMessage with invalid author');
      return;
    }
    await handleGroupInviteMessage({
      inviteMessage: details.updateMessage.inviteMessage as SignalService.GroupUpdateInviteMessage,
      ...details,
      author,
    });
    return;
  }
  // other messages are received from the groups swarm, so source is the groupPk, and senderIdentity is the author
  const author = details.senderIdentity;
  const groupPk = details.source;
  if (!PubKey.is05Pubkey(author) || !PubKey.is03Pubkey(groupPk)) {
    window.log.warn('received group update message with invalid author or groupPk');
    return;
  }
  if (details.updateMessage.memberChangeMessage) {
    await handleGroupMemberChangeMessage({
      memberChangeDetails: details.updateMessage
        .memberChangeMessage as SignalService.GroupUpdateMemberChangeMessage,
      ...details,
      author,
      groupPk,
    });
    return;
  }
}

export const GroupV2Receiver = { handleGroupUpdateMessage };
