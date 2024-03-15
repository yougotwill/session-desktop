import { GroupPubkeyType, PubkeyType, WithGroupPubkey } from 'libsession_util_nodejs';
import { isEmpty, isFinite, isNumber } from 'lodash';
import { ConversationTypeEnum } from '../../models/conversationAttributes';
import { HexString } from '../../node/hexStrings';
import { SignalService } from '../../protobuf';
import { getMessageQueue } from '../../session';
import { getSwarmPollingInstance } from '../../session/apis/snode_api';
import { GetNetworkTime } from '../../session/apis/snode_api/getNetworkTime';
import { ConvoHub } from '../../session/conversations';
import { getSodiumRenderer } from '../../session/crypto';
import { ClosedGroup } from '../../session/group/closed-group';
import { GroupUpdateInviteResponseMessage } from '../../session/messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateInviteResponseMessage';
import { ed25519Str } from '../../session/onions/onionPath';
import { PubKey } from '../../session/types';
import { UserUtils } from '../../session/utils';
import { sleepFor } from '../../session/utils/Promise';
import { stringToUint8Array } from '../../session/utils/String';
import { PreConditionFailed } from '../../session/utils/errors';
import { UserSync } from '../../session/utils/job_runners/jobs/UserSyncJob';
import { LibSessionUtil } from '../../session/utils/libsession/libsession_utils';
import { SessionUtilConvoInfoVolatile } from '../../session/utils/libsession/libsession_utils_convo_info_volatile';
import { groupInfoActions } from '../../state/ducks/metaGroups';
import { toFixedUint8ArrayOfLength } from '../../types/sqlSharedTypes';
import { BlockedNumberController } from '../../util';
import {
  MetaGroupWrapperActions,
  UserGroupsWrapperActions,
} from '../../webworker/workers/browser/libsession_worker_interface';

type WithSignatureTimestamp = { signatureTimestamp: number };
type WithAuthor = { author: PubkeyType };

type WithUncheckedSource = { source: string };
type WithUncheckedSenderIdentity = { senderIdentity: string };

type GroupInviteDetails = {
  inviteMessage: SignalService.GroupUpdateInviteMessage;
} & WithSignatureTimestamp &
  WithAuthor;

type GroupUpdateGeneric<T> = { change: Omit<T, 'toJSON'> } & WithSignatureTimestamp &
  WithGroupPubkey &
  WithAuthor;

type GroupUpdateDetails = {
  updateMessage: SignalService.GroupUpdateMessage;
} & WithSignatureTimestamp;

/**
 * Send the invite response to the group's swarm. An admin will handle it and update our invite pending state to not pending.
 * NOTE:
 *  This message can only be sent once we got the keys for the group, through a poll of the swarm.
 */
async function sendInviteResponseToGroup({ groupPk }: { groupPk: GroupPubkeyType }) {
  window.log.info(`sendInviteResponseToGroup for group ${ed25519Str(groupPk)}`);

  await getMessageQueue().sendToGroupV2({
    message: new GroupUpdateInviteResponseMessage({
      groupPk,
      isApproved: true,
      createAtNetworkTimestamp: GetNetworkTime.now(),
      expirationType: 'unknown', // TODO audric do we want those not expiring?
      expireTimer: 0,
    }),
  });
}

async function handleGroupInviteMessage({
  inviteMessage,
  author,
  signatureTimestamp,
}: GroupInviteDetails) {
  const groupPk = inviteMessage.groupSessionId;
  if (!PubKey.is03Pubkey(groupPk)) {
    return;
  }

  if (BlockedNumberController.isBlocked(author)) {
    window.log.info(
      `received invite to group ${ed25519Str(groupPk)} by blocked user:${ed25519Str(
        author
      )}... dropping it`
    );
    return;
  }

  const authorIsApproved = ConvoHub.use().get(author)?.isApproved() || false;

  const sigValid = await verifySig({
    pubKey: HexString.fromHexStringNoPrefix(groupPk),
    signature: inviteMessage.adminSignature,
    data: stringToUint8Array(`INVITE${UserUtils.getOurPubKeyStrFromCache()}${signatureTimestamp}`),
  });

  if (!sigValid) {
    window.log.warn('received group invite with invalid signature. dropping');
    return;
  }

  window.log.debug(`received invite to group ${ed25519Str(groupPk)} by user:${ed25519Str(author)}`);

  const convo = await ConvoHub.use().getOrCreateAndWait(groupPk, ConversationTypeEnum.GROUPV2);
  convo.set({
    active_at: signatureTimestamp,
    didApproveMe: true,
    conversationIdOrigin: author,
  });

  if (inviteMessage.name && isEmpty(convo.getRealSessionUsername())) {
    convo.set({
      displayNameInProfile: inviteMessage.name,
    });
  }
  const userEd25519Secretkey = (await UserUtils.getUserED25519KeyPairBytes()).privKeyBytes;

  let found = await UserGroupsWrapperActions.getGroup(groupPk);
  if (!found) {
    found = {
      authData: null,
      joinedAtSeconds: Date.now(),
      name: inviteMessage.name,
      priority: 0,
      pubkeyHex: groupPk,
      secretKey: null,
      kicked: false,
      invitePending: true,
    };
  } else {
    found.kicked = false;
    found.name = inviteMessage.name;
  }
  if (authorIsApproved) {
    // pre approve invite to groups when we've already approved the person who invited us
    found.invitePending = false;
  }
  // not sure if we should drop it, or set it again? They should be the same anyway
  found.authData = inviteMessage.memberAuthData;

  await UserGroupsWrapperActions.setGroup(found);
  // force markedAsUnread to be true so it shows the unread banner (we only show the banner if there are unread messages on at least one msg/group request)
  await convo.markAsUnread(true, false);
  await convo.commit();

  await SessionUtilConvoInfoVolatile.insertConvoFromDBIntoWrapperAndRefresh(convo.id);

  await MetaGroupWrapperActions.init(groupPk, {
    metaDumped: null,
    groupEd25519Secretkey: null,
    userEd25519Secretkey: toFixedUint8ArrayOfLength(userEd25519Secretkey, 64).buffer,
    groupEd25519Pubkey: toFixedUint8ArrayOfLength(HexString.fromHexStringNoPrefix(groupPk), 32)
      .buffer,
  });

  await LibSessionUtil.saveDumpsToDb(UserUtils.getOurPubKeyStrFromCache());
  await UserSync.queueNewJobIfNeeded();
  if (!found.invitePending) {
    // if this group should already be polling based on if that author is pre-approved or we've already approved that group from another device.
    getSwarmPollingInstance().addGroupId(groupPk, async () => {
      // we need to do a first poll to fetch the keys etc before we can send our invite response
      // this is pretty hacky, but also an admin seeing a message from that user in the group will mark it as not pending anymore
      await sleepFor(2000);
      await sendInviteResponseToGroup({ groupPk });
    });
  }
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
  signatureTimestamp,
  author,
}: GroupUpdateGeneric<SignalService.GroupUpdateInfoChangeMessage>) {
  const sigValid = await verifySig({
    pubKey: HexString.fromHexStringNoPrefix(groupPk),
    signature: change.adminSignature,
    data: stringToUint8Array(`INFO_CHANGE${change.type}${signatureTimestamp}`),
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
      await ClosedGroup.addUpdateMessage({
        convo,
        diff: { type: 'name', newName: change.updatedName },
        sender: author,
        sentAt: signatureTimestamp,
        expireUpdate: null,
        markAlreadySent: true,
      });

      break;
    }
    case SignalService.GroupUpdateInfoChangeMessage.Type.AVATAR: {
      await ClosedGroup.addUpdateMessage({
        convo,
        diff: { type: 'avatarChange' },
        sender: author,
        sentAt: signatureTimestamp,
        expireUpdate: null,
        markAlreadySent: true,
      });
      break;
    }
    case SignalService.GroupUpdateInfoChangeMessage.Type.DISAPPEARING_MESSAGES: {
      const newTimerSeconds = change.updatedExpiration;
      if (
        newTimerSeconds &&
        isNumber(newTimerSeconds) &&
        isFinite(newTimerSeconds) &&
        newTimerSeconds >= 0
      ) {
        await convo.updateExpireTimer({
          providedExpireTimer: newTimerSeconds,
          providedSource: author,
          providedDisappearingMode: newTimerSeconds > 0 ? 'deleteAfterSend' : 'off',
          sentAt: signatureTimestamp,
          fromCurrentDevice: false,
          fromSync: false,
          fromConfigMessage: false,
        });
      }
      break;
    }
    default:
      return;
  }

  convo.set({
    active_at: signatureTimestamp,
  });
}

async function handleGroupMemberChangeMessage({
  change,
  groupPk,
  signatureTimestamp,
  author,
}: GroupUpdateGeneric<SignalService.GroupUpdateMemberChangeMessage>) {
  const convo = ConvoHub.use().get(groupPk);
  if (!convo) {
    return;
  }

  const sigValid = await verifySig({
    pubKey: HexString.fromHexStringNoPrefix(groupPk),
    signature: change.adminSignature,
    data: stringToUint8Array(`MEMBER_CHANGE${change.type}${signatureTimestamp}`),
  });
  if (!sigValid) {
    window.log.warn('received group member change with invalid signature. dropping');
    return;
  }
  const filteredMemberChange = change.memberSessionIds.filter(PubKey.is05Pubkey);

  if (!filteredMemberChange) {
    window.log.info('returning groupupdate of member change without associated members...');

    return;
  }
  const sharedDetails = {
    convo,
    sender: author,
    sentAt: signatureTimestamp,
    expireUpdate: null,
    markAlreadySent: true,
  };

  switch (change.type) {
    case SignalService.GroupUpdateMemberChangeMessage.Type.ADDED: {
      await ClosedGroup.addUpdateMessage({
        diff: { type: 'add', added: filteredMemberChange, withHistory: change.historyShared },
        ...sharedDetails,
      });

      break;
    }
    case SignalService.GroupUpdateMemberChangeMessage.Type.REMOVED: {
      await ClosedGroup.addUpdateMessage({
        diff: { type: 'kicked', kicked: filteredMemberChange },
        ...sharedDetails,
      });
      break;
    }
    case SignalService.GroupUpdateMemberChangeMessage.Type.PROMOTED: {
      await ClosedGroup.addUpdateMessage({
        diff: { type: 'promoted', promoted: filteredMemberChange },
        ...sharedDetails,
      });
      break;
    }
    default:
      return;
  }

  convo.set({
    active_at: signatureTimestamp,
  });
}

async function handleGroupMemberLeftMessage({
  groupPk,
  signatureTimestamp,
  author,
}: GroupUpdateGeneric<SignalService.GroupUpdateMemberLeftMessage>) {
  // No need to verify sig, the author is already verified with the libsession.decrypt()
  const convo = ConvoHub.use().get(groupPk);
  if (!convo || !PubKey.is05Pubkey(author)) {
    return;
  }

  // this does nothing if we are not an admin
  window.inboxStore.dispatch(
    groupInfoActions.handleMemberLeftMessage({
      groupPk,
      memberLeft: author,
    })
  );

  await ClosedGroup.addUpdateMessage({
    convo,
    diff: { type: 'left', left: [author] },
    sender: author,
    sentAt: signatureTimestamp,
    expireUpdate: null,
    markAlreadySent: true,
  });

  convo.set({
    active_at: signatureTimestamp,
  });
  // debugger TODO We should process this message type even if the sender is blocked
}

async function handleGroupDeleteMemberContentMessage({
  groupPk,
  signatureTimestamp,
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
      `DELETE_CONTENT${signatureTimestamp}${change.memberSessionIds.join()}${change.messageHashes.join()}`
    ),
  });

  if (!sigValid) {
    window.log.warn('received group member delete content with invalid signature. dropping');
    return;
  }

  // TODO we should process this message type even if the sender is blocked
  convo.set({
    active_at: signatureTimestamp,
  });
  throw new Error('Not implemented');
}

async function handleGroupUpdateDeleteMessage({
  groupPk,
  signatureTimestamp,
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
    data: stringToUint8Array(`DELETE${signatureTimestamp}${change.memberSessionIds.join()}`),
  });

  if (!sigValid) {
    window.log.warn('received group delete message with invalid signature. dropping');
    return;
  }
  convo.set({
    active_at: signatureTimestamp,
  });
  throw new Error('Not implemented');
  // TODO We should process this message type even if the sender is blocked
}

async function handleGroupUpdateInviteResponseMessage({
  groupPk,
  change,
  author,
}: Omit<GroupUpdateGeneric<SignalService.GroupUpdateInviteResponseMessage>, 'signatureTimestamp'>) {
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
      secret: groupKeypair.privateKey,
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

export const GroupV2Receiver = {
  handleGroupUpdateMessage,
  sendInviteResponseToGroup,
  handleGroupUpdateInviteResponseMessage,
};
