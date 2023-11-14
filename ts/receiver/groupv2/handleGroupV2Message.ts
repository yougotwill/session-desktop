import { GroupPubkeyType, PubkeyType, WithGroupPubkey } from 'libsession_util_nodejs';
import { isEmpty, isFinite, isNumber } from 'lodash';
import { ConversationTypeEnum } from '../../models/conversationAttributes';
import { HexString } from '../../node/hexStrings';
import { SignalService } from '../../protobuf';
import { getSwarmPollingInstance } from '../../session/apis/snode_api';
import { GetNetworkTime } from '../../session/apis/snode_api/getNetworkTime';
import { ConvoHub } from '../../session/conversations';
import { getSodiumRenderer } from '../../session/crypto';
import { ClosedGroup } from '../../session/group/closed-group';
import { GroupUpdateInviteResponseMessage } from '../../session/messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateInviteResponseMessage';
import { ed25519Str } from '../../session/onions/onionPath';
import { getMessageQueue } from '../../session/sending';
import { PubKey } from '../../session/types';
import { UserUtils } from '../../session/utils';
import { stringToUint8Array } from '../../session/utils/String';
import { PreConditionFailed } from '../../session/utils/errors';
import { UserSync } from '../../session/utils/job_runners/jobs/UserSyncJob';
import { LibSessionUtil } from '../../session/utils/libsession/libsession_utils';
import { groupInfoActions } from '../../state/ducks/groups';
import { toFixedUint8ArrayOfLength } from '../../types/sqlSharedTypes';
import { BlockedNumberController } from '../../util';
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

type GroupUpdateGeneric<T> = { change: T } & WithEnvelopeTimestamp & WithGroupPubkey & WithAuthor;

type GroupUpdateDetails = {
  updateMessage: SignalService.GroupUpdateMessage;
} & WithEnvelopeTimestamp;

async function handleGroupInviteMessage({
  inviteMessage,
  author,
  envelopeTimestamp,
}: GroupInviteDetails) {
  if (!PubKey.is03Pubkey(inviteMessage.groupSessionId)) {
    return;
  }

  if (BlockedNumberController.isBlocked(author)) {
    window.log.info(
      `received invite to group ${ed25519Str(
        inviteMessage.groupSessionId
      )} by blocked user:${ed25519Str(author)}... dropping it`
    );
    return;
  }
  debugger;
  const sigValid = await verifySig({
    pubKey: HexString.fromHexStringNoPrefix(inviteMessage.groupSessionId),
    signature: inviteMessage.adminSignature,
    data: stringToUint8Array(`INVITE${UserUtils.getOurPubKeyStrFromCache()}${envelopeTimestamp}`),
  });

  if (!sigValid) {
    window.log.warn('received group invite with invalid signature. dropping');
    return;
  }

  window.log.debug(
    `received invite to group ${ed25519Str(inviteMessage.groupSessionId)} by user:${ed25519Str(
      author
    )}`
  );
  const convo = await ConvoHub.use().getOrCreateAndWait(
    inviteMessage.groupSessionId,
    ConversationTypeEnum.GROUPV2
  );
  convo.set({
    active_at: envelopeTimestamp,
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
      HexString.fromHexStringNoPrefix(inviteMessage.groupSessionId),
      32
    ).buffer,
  });
  await LibSessionUtil.saveDumpsToDb(UserUtils.getOurPubKeyStrFromCache());
  await UserSync.queueNewJobIfNeeded();

  // TODO currently sending auto-accept of invite. needs to be removed once we get the Group message request logic
  debugger;
  console.warn('currently sending auto accept invite response');
  await getMessageQueue().sendToGroupV2({
    message: new GroupUpdateInviteResponseMessage({
      groupPk: inviteMessage.groupSessionId,
      isApproved: true,
      createAtNetworkTimestamp: GetNetworkTime.now(),
    }),
  });

  // TODO use the pending so we actually don't start polling here unless it is not in the pending state.
  // once everything is ready, start polling using that authData to get the keys, members, details of that group, and its messages.
  getSwarmPollingInstance().addGroupId(inviteMessage.groupSessionId);
}

async function verifySig({
  data,
  pubKey,
  signature,
}: {
  data: Uint8Array;
  signature: Uint8Array;
  pubKey: Uint8Array;
}) {
  const sodium = await getSodiumRenderer();
  return sodium.crypto_sign_verify_detached(signature, data, pubKey);
}

async function handleGroupInfoChangeMessage({
  change,
  groupPk,
  envelopeTimestamp,
  author,
}: GroupUpdateGeneric<SignalService.GroupUpdateInfoChangeMessage>) {
  const sigValid = await verifySig({
    pubKey: HexString.fromHexStringNoPrefix(groupPk),
    signature: change.adminSignature,
    data: stringToUint8Array(`INFO_CHANGE${change.type}${envelopeTimestamp}`),
  });
  if (!sigValid) {
    window.log.warn('received group info change with invalid signature. dropping');
    return;
  }
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    return;
  }

  switch (change.type) {
    case SignalService.GroupUpdateInfoChangeMessage.Type.NAME: {
      await ClosedGroup.addUpdateMessage(
        convo,
        { newName: change.updatedName },
        author,
        envelopeTimestamp
      );

      break;
    }
    case SignalService.GroupUpdateInfoChangeMessage.Type.AVATAR: {
      console.warn('Not implemented');
      throw new Error('Not implemented');
    }
    case SignalService.GroupUpdateInfoChangeMessage.Type.DISAPPEARING_MESSAGES: {
      if (
        change.updatedExpiration &&
        isNumber(change.updatedExpiration) &&
        isFinite(change.updatedExpiration) &&
        change.updatedExpiration >= 0
      ) {
        await convo.updateExpireTimer(change.updatedExpiration, author, envelopeTimestamp);
      }
      break;
    }
    default:
      return;
  }

  convo.set({
    active_at: envelopeTimestamp,
  });
}

async function handleGroupMemberChangeMessage({
  change,
  groupPk,
  envelopeTimestamp,
  author,
}: GroupUpdateGeneric<SignalService.GroupUpdateMemberChangeMessage>) {
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    return;
  }

  const sigValid = await verifySig({
    pubKey: HexString.fromHexStringNoPrefix(groupPk),
    signature: change.adminSignature,
    data: stringToUint8Array(`MEMBER_CHANGE${change.type}${envelopeTimestamp}`),
  });
  if (!sigValid) {
    window.log.warn('received group member change with invalid signature. dropping');
    return;
  }

  switch (change.type) {
    case SignalService.GroupUpdateMemberChangeMessage.Type.ADDED: {
      await ClosedGroup.addUpdateMessage(
        convo,
        { joiningMembers: change.memberSessionIds },
        author,
        envelopeTimestamp
      );

      break;
    }
    case SignalService.GroupUpdateMemberChangeMessage.Type.REMOVED: {
      await ClosedGroup.addUpdateMessage(
        convo,
        { kickedMembers: change.memberSessionIds },
        author,
        envelopeTimestamp
      );
      break;
    }
    case SignalService.GroupUpdateMemberChangeMessage.Type.PROMOTED: {
      await ClosedGroup.addUpdateMessage(
        convo,
        { promotedMembers: change.memberSessionIds },
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
  });
}

async function handleGroupMemberLeftMessage({
  groupPk,
  envelopeTimestamp,
  author,
}: GroupUpdateGeneric<SignalService.GroupUpdateMemberLeftMessage>) {
  // No need to verify sig, the author is already verified with the libsession.decrypt()
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    return;
  }

  await ClosedGroup.addUpdateMessage(
    convo,
    { leavingMembers: [author] },
    author,
    envelopeTimestamp
  );
  convo.set({
    active_at: envelopeTimestamp,
  });
  // TODO We should process this message type even if the sender is blocked
}

async function handleGroupDeleteMemberContentMessage({
  groupPk,
  envelopeTimestamp,
  change,
}: GroupUpdateGeneric<SignalService.GroupUpdateDeleteMemberContentMessage>) {
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    return;
  }

  const sigValid = await verifySig({
    pubKey: HexString.fromHexStringNoPrefix(groupPk),
    signature: change.adminSignature,
    data: stringToUint8Array(
      `DELETE_CONTENT${envelopeTimestamp}${change.memberSessionIds.join()}${change.messageHashes.join()}`
    ),
  });

  if (!sigValid) {
    window.log.warn('received group member delete content with invalid signature. dropping');
    return;
  }

  // TODO we should process this message type even if the sender is blocked
  console.warn('Not implemented');
  convo.set({
    active_at: envelopeTimestamp,
  });
  throw new Error('Not implemented');
}

async function handleGroupUpdateDeleteMessage({
  groupPk,
  envelopeTimestamp,
  change,
}: GroupUpdateGeneric<SignalService.GroupUpdateDeleteMessage>) {
  // TODO verify sig?
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    return;
  }
  const sigValid = await verifySig({
    pubKey: HexString.fromHexStringNoPrefix(groupPk),
    signature: change.adminSignature,
    data: stringToUint8Array(`DELETE${envelopeTimestamp}${change.memberSessionIds.join()}`),
  });

  if (!sigValid) {
    window.log.warn('received group delete message with invalid signature. dropping');
    return;
  }
  convo.set({
    active_at: envelopeTimestamp,
  });
  console.warn('Not implemented');
  throw new Error('Not implemented');
  // TODO We should process this message type even if the sender is blocked
}

async function handleGroupUpdateInviteResponseMessage({
  groupPk,
  change,
  author,
}: GroupUpdateGeneric<SignalService.GroupUpdateInviteResponseMessage>) {
  // no sig verify for this type of message
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    return;
  }
  if (!change.isApproved) {
    window.log.info('got inviteResponse but isApproved is false. Dropping');
    return;
  }

  window.inboxStore.dispatch(groupInfoActions.inviteResponseReceived({ groupPk, member: author }));

  // TODO We should process this message type even if the sender is blocked
}

async function handleGroupUpdatePromoteMessage({
  change,
}: Omit<GroupUpdateGeneric<SignalService.GroupUpdatePromoteMessage>, 'groupPk'>) {
  const seed = change.groupIdentitySeed;
  const sodium = await getSodiumRenderer();
  const groupKeypair = sodium.crypto_sign_seed_keypair(seed);

  const groupPk = `03${HexString.toHexString(groupKeypair.publicKey)}` as GroupPubkeyType;

  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    return;
  }
  // no group update message here, another message is sent to the group's swarm for the update message.
  // this message is just about the keys that we need to save, and accepting the promotion.

  const found = await UserGroupsWrapperActions.getGroup(groupPk);

  if (!found) {
    // could have been removed by the user already so let's not force create it
    window.log.info(
      'received group promote message but that group is not in the usergroups wrapper'
    );
    return;
  }
  found.secretKey = groupKeypair.privateKey;
  await UserGroupsWrapperActions.setGroup(found);
  await UserSync.queueNewJobIfNeeded();

  window.inboxStore.dispatch(
    groupInfoActions.markUsAsAdmin({
      groupPk,
    })
  );

  // TODO we should process this even if the sender is blocked
}

async function handle1o1GroupUpdateMessage(
  details: GroupUpdateDetails & WithUncheckedSource & WithUncheckedSenderIdentity
) {
  // the message types below are received from our own swarm, so source is the sender, and senderIdentity is empty

  if (details.updateMessage.inviteMessage || details.updateMessage.promoteMessage) {
    if (!PubKey.is05Pubkey(details.source)) {
      window.log.warn('received group invite/promote with invalid author');
      throw new PreConditionFailed('received group invite/promote with invalid author');
    }
    if (details.updateMessage.inviteMessage) {
      await handleGroupInviteMessage({
        inviteMessage: details.updateMessage
          .inviteMessage as SignalService.GroupUpdateInviteMessage,
        ...details,
        author: details.source,
      });
    } else if (details.updateMessage.promoteMessage) {
      await handleGroupUpdatePromoteMessage({
        change: details.updateMessage.promoteMessage as SignalService.GroupUpdatePromoteMessage,
        ...details,
        author: details.source,
      });
    }

    // returns true for all cases where this message was expected to be a 1o1 message, even if not processed
    return true;
  }

  return false;
}

async function handleGroupUpdateMessage(
  details: GroupUpdateDetails & WithUncheckedSource & WithUncheckedSenderIdentity
) {
  const was1o1Message = await handle1o1GroupUpdateMessage(details);
  if (was1o1Message) {
    return;
  }

  // other messages are received from the groups swarm, so source is the groupPk, and senderIdentity is the author
  const author = details.senderIdentity;
  const groupPk = details.source;
  if (!PubKey.is05Pubkey(author) || !PubKey.is03Pubkey(groupPk)) {
    window.log.warn('received group update message with invalid author or groupPk');
    return;
  }
  const detailsWithContext = { ...details, author, groupPk };

  if (details.updateMessage.memberChangeMessage) {
    await handleGroupMemberChangeMessage({
      change: details.updateMessage
        .memberChangeMessage as SignalService.GroupUpdateMemberChangeMessage,
      ...detailsWithContext,
    });
    return;
  }

  if (details.updateMessage.infoChangeMessage) {
    await handleGroupInfoChangeMessage({
      change: details.updateMessage.infoChangeMessage as SignalService.GroupUpdateInfoChangeMessage,
      ...detailsWithContext,
    });
    return;
  }

  if (details.updateMessage.memberLeftMessage) {
    await handleGroupMemberLeftMessage({
      change: details.updateMessage.memberLeftMessage as SignalService.GroupUpdateMemberLeftMessage,
      ...detailsWithContext,
    });
    return;
  }
  if (details.updateMessage.deleteMemberContent) {
    await handleGroupDeleteMemberContentMessage({
      change: details.updateMessage
        .deleteMemberContent as SignalService.GroupUpdateDeleteMemberContentMessage,
      ...detailsWithContext,
    });
    return;
  }
  if (details.updateMessage.deleteMessage) {
    await handleGroupUpdateDeleteMessage({
      change: details.updateMessage.deleteMessage as SignalService.GroupUpdateDeleteMessage,
      ...detailsWithContext,
    });
    return;
  }
  if (details.updateMessage.inviteResponse) {
    await handleGroupUpdateInviteResponseMessage({
      change: details.updateMessage
        .inviteResponse as SignalService.GroupUpdateInviteResponseMessage,
      ...detailsWithContext,
    });
    return;
  }

  window.log.warn('received group update of unknown type. Discarding...');
}

export const GroupV2Receiver = { handleGroupUpdateMessage };
