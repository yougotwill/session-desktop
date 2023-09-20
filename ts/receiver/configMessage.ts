/* eslint-disable no-await-in-loop */
import { ContactInfo } from 'libsession_util_nodejs';
import { compact, difference, isEmpty, isNil, isNumber, toNumber } from 'lodash';
import { ConfigDumpData } from '../data/configDump/configDump';
import { SettingsKey } from '../data/settings-key';
import { deleteAllMessagesByConvoIdNoConfirmation } from '../interactions/conversationInteractions';
import { CONVERSATION_PRIORITIES, ConversationTypeEnum } from '../models/conversationAttributes';
import { SignalService } from '../protobuf';
import { ClosedGroup } from '../session';
import { getOpenGroupManager } from '../session/apis/open_group_api/opengroupV2/OpenGroupManagerV2';
import { OpenGroupUtils } from '../session/apis/open_group_api/utils';
import { getOpenGroupV2ConversationId } from '../session/apis/open_group_api/utils/OpenGroupUtils';
import { getSwarmPollingInstance } from '../session/apis/snode_api';
import { getConversationController } from '../session/conversations';
import { IncomingMessage } from '../session/messages/incoming/IncomingMessage';
import { ProfileManager } from '../session/profile_manager/ProfileManager';
import { PubKey } from '../session/types';
import { StringUtils, UserUtils } from '../session/utils';
import { toHex } from '../session/utils/String';
import { ConfigurationSync } from '../session/utils/job_runners/jobs/ConfigurationSyncJob';
import { LibSessionUtil } from '../session/utils/libsession/libsession_utils';
import { SessionUtilContact } from '../session/utils/libsession/libsession_utils_contacts';
import { SessionUtilConvoInfoVolatile } from '../session/utils/libsession/libsession_utils_convo_info_volatile';
import { SessionUtilUserGroups } from '../session/utils/libsession/libsession_utils_user_groups';
import { configurationMessageReceived, trigger } from '../shims/events';
import { getCurrentlySelectedConversationOutsideRedux } from '../state/selectors/conversations';
import { assertUnreachable, stringify, toFixedUint8ArrayOfLength } from '../types/sqlSharedTypes';
import { BlockedNumberController } from '../util';
import { Storage, setLastProfileUpdateTimestamp } from '../util/storage';
// eslint-disable-next-line import/no-unresolved, import/extensions
import {
  ConfigWrapperObjectTypesMeta,
  ConfigWrapperUser,
  getGroupPubkeyFromWrapperType,
  isUserConfigWrapperType,
} from '../webworker/workers/browser/libsession_worker_functions';
import { UserConfigKind, isUserKind } from '../types/ProtobufKind';
import {
  ContactsWrapperActions,
  ConvoInfoVolatileWrapperActions,
  GenericWrapperActions,
  MetaGroupWrapperActions,
  UserConfigWrapperActions,
  UserGroupsWrapperActions,
} from '../webworker/workers/browser/libsession_worker_interface';
import { addKeyPairToCacheAndDBIfNeeded } from './closedGroups';
import { HexKeyPair } from './keypairs';
import { queueAllCachedFromSource } from './receiver';
import { HexString } from '../node/hexStrings';

type IncomingUserResult = {
  needsPush: boolean;
  needsDump: boolean;
  kind: UserConfigKind;
  publicKey: string;
  latestEnvelopeTimestamp: number;
};

function byUserVariant(
  incomingConfigs: Array<IncomingMessage<SignalService.ISharedConfigMessage>>
) {
  const groupedByVariant: Map<
    ConfigWrapperUser,
    Array<IncomingMessage<SignalService.ISharedConfigMessage>>
  > = new Map();

  incomingConfigs.forEach(incomingConfig => {
    const { kind } = incomingConfig.message;
    if (!isUserKind(kind)) {
      throw new Error(`Invalid kind when handling userkinds: ${kind}`);
    }

    const wrapperId = LibSessionUtil.userKindToVariant(kind);

    if (!groupedByVariant.has(wrapperId)) {
      groupedByVariant.set(wrapperId, []);
    }

    groupedByVariant.get(wrapperId)?.push(incomingConfig);
  });
  return groupedByVariant;
}

async function printDumpForDebug(prefix: string, variant: ConfigWrapperObjectTypesMeta) {
  if (isUserConfigWrapperType(variant)) {
    window.log.info(prefix, StringUtils.toHex(await GenericWrapperActions.dump(variant)));
    return;
  }
  const metaGroupDumps = await MetaGroupWrapperActions.metaDebugDump(
    getGroupPubkeyFromWrapperType(variant)
  );
  window.log.info(prefix, StringUtils.toHex(metaGroupDumps));
}

async function mergeUserConfigsWithIncomingUpdates(
  incomingConfigs: Array<IncomingMessage<SignalService.ISharedConfigMessage>>
): Promise<Map<ConfigWrapperUser, IncomingUserResult>> {
  // first, group by variant so we do a single merge call
  // Note: this call throws if given a non user kind as this functio should only handle user variants/kinds
  const groupedByVariant = byUserVariant(incomingConfigs);

  const groupedResults: Map<ConfigWrapperUser, IncomingUserResult> = new Map();

  const publicKey = UserUtils.getOurPubKeyStrFromCache();

  try {
    for (let index = 0; index < groupedByVariant.size; index++) {
      const variant = [...groupedByVariant.keys()][index];
      const sameVariant = groupedByVariant.get(variant);
      if (!sameVariant?.length) {
        continue;
      }
      const toMerge = sameVariant.map(msg => ({
        data: msg.message.data,
        hash: msg.messageHash,
      }));
      if (window.sessionFeatureFlags.debug.debugLibsessionDumps) {
        await printDumpForDebug(`printDumpsForDebugging: before merge of ${variant}:`, variant);
      }

      const mergedCount = await GenericWrapperActions.merge(variant, toMerge);

      const needsDump = await GenericWrapperActions.needsDump(variant);
      const needsPush = await GenericWrapperActions.needsPush(variant);
      const latestEnvelopeTimestamp = Math.max(...sameVariant.map(m => m.envelopeTimestamp));

      window.log.debug(
        `${variant}: "${publicKey}" needsPush:${needsPush} needsDump:${needsDump}; mergedCount:${mergedCount} `
      );

      if (window.sessionFeatureFlags.debug.debugLibsessionDumps) {
        await printDumpForDebug(`printDumpsForDebugging: after merge of ${variant}:`, variant);
      }
      const incomingConfResult: IncomingUserResult = {
        needsDump,
        needsPush,
        kind: LibSessionUtil.userVariantToUserKind(variant),
        publicKey,
        latestEnvelopeTimestamp: latestEnvelopeTimestamp || Date.now(),
      };
      groupedResults.set(variant, incomingConfResult);
    }

    return groupedResults;
  } catch (e) {
    window.log.error('mergeConfigsWithIncomingUpdates failed with', e);
    throw e;
  }
}

export function getSettingsKeyFromLibsessionWrapper(
  wrapperType: ConfigWrapperObjectTypesMeta
): string | null {
  if (!isUserConfigWrapperType(wrapperType)) {
    throw new Error(
      `getSettingsKeyFromLibsessionWrapper only cares about uservariants but got ${wrapperType}`
    );
  }
  switch (wrapperType) {
    case 'UserConfig':
      return SettingsKey.latestUserProfileEnvelopeTimestamp;
    case 'ContactsConfig':
      return SettingsKey.latestUserContactsEnvelopeTimestamp;
    case 'UserGroupsConfig':
      return SettingsKey.latestUserGroupEnvelopeTimestamp;
    case 'ConvoInfoVolatileConfig':
      return null; // we don't really care about the convo info volatile one
    default:
      try {
        assertUnreachable(
          wrapperType,
          `getSettingsKeyFromLibsessionWrapper unknown type: ${wrapperType}`
        );
      } catch (e) {
        window.log.warn('assertUnreachable:', e.message);
      }
      return null;
  }
}

async function updateLibsessionLatestProcessedUserTimestamp(
  wrapperType: ConfigWrapperUser,
  latestEnvelopeTimestamp: number
) {
  const settingsKey = getSettingsKeyFromLibsessionWrapper(wrapperType);
  if (!settingsKey) {
    return;
  }
  const currentLatestEnvelopeProcessed = Storage.get(settingsKey) || 0;

  const newLatestProcessed = Math.max(
    latestEnvelopeTimestamp,
    isNumber(currentLatestEnvelopeProcessed) ? currentLatestEnvelopeProcessed : 0
  );
  if (newLatestProcessed !== currentLatestEnvelopeProcessed || currentLatestEnvelopeProcessed) {
    await Storage.put(settingsKey, newLatestProcessed);
  }
}

async function handleUserProfileUpdate(result: IncomingUserResult) {
  const updateUserInfo = await UserConfigWrapperActions.getUserInfo();
  if (!updateUserInfo) {
    return;
  }

  const currentBlindedMsgRequest = Storage.get(SettingsKey.hasBlindedMsgRequestsEnabled);
  const newBlindedMsgRequest = await UserConfigWrapperActions.getEnableBlindedMsgRequest();
  if (!isNil(newBlindedMsgRequest) && newBlindedMsgRequest !== currentBlindedMsgRequest) {
    await window.setSettingValue(SettingsKey.hasBlindedMsgRequestsEnabled, newBlindedMsgRequest); // this does the dispatch to redux
  }

  const picUpdate = !isEmpty(updateUserInfo.key) && !isEmpty(updateUserInfo.url);

  // NOTE: if you do any changes to the settings of a user which are synced, it should be done above the `updateOurProfileViaLibSession` call
  await updateOurProfileViaLibSession(
    result.latestEnvelopeTimestamp,
    updateUserInfo.name,
    picUpdate ? updateUserInfo.url : null,
    picUpdate ? updateUserInfo.key : null,
    updateUserInfo.priority
  );

  const settingsKey = SettingsKey.latestUserProfileEnvelopeTimestamp;
  const currentLatestEnvelopeProcessed = Storage.get(settingsKey) || 0;

  const newLatestProcessed = Math.max(
    result.latestEnvelopeTimestamp,
    isNumber(currentLatestEnvelopeProcessed) ? currentLatestEnvelopeProcessed : 0
  );
  if (newLatestProcessed !== currentLatestEnvelopeProcessed) {
    await Storage.put(settingsKey, newLatestProcessed);
  }
}

function getContactsToRemoveFromDB(contactsInWrapper: Array<ContactInfo>) {
  const allContactsInDBWhichShouldBeInWrapperIds = getConversationController()
    .getConversations()
    .filter(SessionUtilContact.isContactToStoreInWrapper)
    .map(m => m.id as string);

  const currentlySelectedConversationId = getCurrentlySelectedConversationOutsideRedux();
  const currentlySelectedConvo = currentlySelectedConversationId
    ? getConversationController().get(currentlySelectedConversationId)
    : undefined;

  // we might have some contacts not in the wrapper anymore, so let's clean things up.

  const convoIdsInDbButNotWrapper = difference(
    allContactsInDBWhichShouldBeInWrapperIds,
    contactsInWrapper.map(m => m.id)
  );

  // When starting a conversation with a new user, it is not in the wrapper yet, only when we send the first message.
  // We do not want to forcefully remove that contact as the user might be typing a message to him.
  // So let's check if that currently selected conversation should be forcefully closed or not
  if (
    currentlySelectedConversationId &&
    currentlySelectedConvo &&
    convoIdsInDbButNotWrapper.includes(currentlySelectedConversationId)
  ) {
    if (
      currentlySelectedConvo.isPrivate() &&
      !currentlySelectedConvo.isApproved() &&
      !currentlySelectedConvo.didApproveMe()
    ) {
      const foundIndex = convoIdsInDbButNotWrapper.findIndex(
        m => m === currentlySelectedConversationId
      );
      if (foundIndex !== -1) {
        convoIdsInDbButNotWrapper.splice(foundIndex, 1);
      }
    }
  }
  return convoIdsInDbButNotWrapper;
}

async function deleteContactsFromDB(contactsToRemove: Array<string>) {
  window.log.debug('contacts to fully remove after wrapper merge', contactsToRemove);
  for (let index = 0; index < contactsToRemove.length; index++) {
    const contactToRemove = contactsToRemove[index];
    try {
      await getConversationController().delete1o1(contactToRemove, {
        fromSyncMessage: true,
        justHidePrivate: false,
      });
    } catch (e) {
      window.log.warn(
        `after merge: deleteContactsFromDB ${contactToRemove} failed with `,
        e.message
      );
    }
  }
}

async function handleContactsUpdate() {
  const us = UserUtils.getOurPubKeyStrFromCache();

  const allContactsInWrapper = await ContactsWrapperActions.getAll();
  const contactsToRemoveFromDB = getContactsToRemoveFromDB(allContactsInWrapper);
  await deleteContactsFromDB(contactsToRemoveFromDB);

  // create new contact conversation here, and update their state with what is part of the wrapper
  for (let index = 0; index < allContactsInWrapper.length; index++) {
    const wrapperConvo = allContactsInWrapper[index];

    if (wrapperConvo.id === us) {
      // our profile update comes from our userProfile, not from the contacts wrapper.
      continue;
    }
    const contactConvo = await getConversationController().getOrCreateAndWait(
      wrapperConvo.id,
      ConversationTypeEnum.PRIVATE
    );
    if (wrapperConvo.id && contactConvo) {
      let changes = false;

      // the display name set is handled in `updateProfileOfContact`
      if (wrapperConvo.nickname !== contactConvo.getNickname()) {
        await contactConvo.setNickname(wrapperConvo.nickname || null, false);
        changes = true;
      }

      const currentPriority = contactConvo.getPriority();
      if (wrapperConvo.priority !== currentPriority) {
        if (wrapperConvo.priority === CONVERSATION_PRIORITIES.hidden) {
          window.log.info(
            'contact marked as hidden and was not before. Deleting all messages from that user'
          );
          await deleteAllMessagesByConvoIdNoConfirmation(wrapperConvo.id);
        }
        await contactConvo.setPriorityFromWrapper(wrapperConvo.priority);
        changes = true;
      }

      if (Boolean(wrapperConvo.approved) !== contactConvo.isApproved()) {
        await contactConvo.setIsApproved(Boolean(wrapperConvo.approved), false);
        changes = true;
      }

      if (Boolean(wrapperConvo.approvedMe) !== contactConvo.didApproveMe()) {
        await contactConvo.setDidApproveMe(Boolean(wrapperConvo.approvedMe), false);
        changes = true;
      }

      // if (wrapperConvo.expirationTimerSeconds !== contactConvo.get('expireTimer')) {
      //   await contactConvo.updateExpireTimer(wrapperConvo.expirationTimerSeconds);
      //   changes = true;
      // }

      // we want to set the active_at to the created_at timestamp if active_at is unset, so that it shows up in our list.
      if (!contactConvo.getActiveAt() && wrapperConvo.createdAtSeconds) {
        contactConvo.set({ active_at: wrapperConvo.createdAtSeconds * 1000 });
        changes = true;
      }

      const convoBlocked = wrapperConvo.blocked || false;
      await BlockedNumberController.setBlocked(wrapperConvo.id, convoBlocked);

      // make sure to write the changes to the database now as the `AvatarDownloadJob` below might take some time before getting run
      if (changes) {
        await contactConvo.commit();
      }

      // we still need to handle the `name` (synchronous) and the `profilePicture` (asynchronous)
      await ProfileManager.updateProfileOfContact(
        contactConvo.id,
        wrapperConvo.name,
        wrapperConvo.profilePicture?.url || null,
        wrapperConvo.profilePicture?.key || null
      );
    }
  }
}

async function handleCommunitiesUpdate() {
  // first let's check which communities needs to be joined or left by doing a diff of what is in the wrapper and what is in the DB

  const allCommunitiesInWrapper = await UserGroupsWrapperActions.getAllCommunities();
  window.log.debug(
    'allCommunitiesInWrapper',
    allCommunitiesInWrapper.map(m => m.fullUrlWithPubkey)
  );
  const allCommunitiesConversation = getConversationController()
    .getConversations()
    .filter(SessionUtilUserGroups.isCommunityToStoreInWrapper);

  const allCommunitiesIdsInDB = allCommunitiesConversation.map(m => m.id as string);
  window.log.debug('allCommunitiesIdsInDB', allCommunitiesIdsInDB);

  const communitiesIdsInWrapper = compact(
    allCommunitiesInWrapper.map(m => {
      try {
        const builtConvoId = OpenGroupUtils.getOpenGroupV2ConversationId(
          m.baseUrl,
          m.roomCasePreserved
        );
        return builtConvoId;
      } catch (e) {
        return null;
      }
    })
  );

  const communitiesToJoinInDB = compact(
    allCommunitiesInWrapper.map(m => {
      try {
        const builtConvoId = OpenGroupUtils.getOpenGroupV2ConversationId(
          m.baseUrl,
          m.roomCasePreserved
        );
        return allCommunitiesIdsInDB.includes(builtConvoId) ? null : m;
      } catch (e) {
        return null;
      }
    })
  );

  const communitiesToLeaveInDB = compact(
    allCommunitiesConversation.map(m => {
      return communitiesIdsInWrapper.includes(m.id) ? null : m;
    })
  );

  for (let index = 0; index < communitiesToLeaveInDB.length; index++) {
    const toLeave = communitiesToLeaveInDB[index];
    window.log.info('leaving community with convoId ', toLeave.id);
    await getConversationController().deleteCommunity(toLeave.id, {
      fromSyncMessage: true,
    });
  }

  // this call can take quite a long time but must be awaited (as it is async and create the entry in the DB, used as a diff)
  try {
    await Promise.all(
      communitiesToJoinInDB.map(async toJoin => {
        window.log.info('joining community with convoId ', toJoin.fullUrlWithPubkey);
        return getOpenGroupManager().attemptConnectionV2OneAtATime(
          toJoin.baseUrl,
          toJoin.roomCasePreserved,
          toJoin.pubkeyHex
        );
      })
    );
  } catch (e) {
    window.log.warn(
      `joining community with failed with one of ${communitiesToJoinInDB}`,
      e.message
    );
  }

  // if the convos already exists, make sure to update the fields if needed
  for (let index = 0; index < allCommunitiesInWrapper.length; index++) {
    const fromWrapper = allCommunitiesInWrapper[index];
    const convoId = OpenGroupUtils.getOpenGroupV2ConversationId(
      fromWrapper.baseUrl,
      fromWrapper.roomCasePreserved
    );

    const communityConvo = getConversationController().get(convoId);
    if (fromWrapper && communityConvo) {
      let changes = false;

      changes =
        (await communityConvo.setPriorityFromWrapper(fromWrapper.priority, false)) || changes;

      // make sure to write the changes to the database now as the `AvatarDownloadJob` below might take some time before getting run
      if (changes) {
        await communityConvo.commit();
      }
    }
  }
}

async function handleLegacyGroupUpdate(latestEnvelopeTimestamp: number) {
  // first let's check which closed groups needs to be joined or left by doing a diff of what is in the wrapper and what is in the DB
  const allLegacyGroupsInWrapper = await UserGroupsWrapperActions.getAllLegacyGroups();
  const allLegacyGroupsInDb = getConversationController()
    .getConversations()
    .filter(SessionUtilUserGroups.isLegacyGroupToRemoveFromDBIfNotInWrapper);

  const allLegacyGroupsIdsInDB = allLegacyGroupsInDb.map(m => m.id as string);
  const allLegacyGroupsIdsInWrapper = allLegacyGroupsInWrapper.map(m => m.pubkeyHex);

  const legacyGroupsToJoinInDB = allLegacyGroupsInWrapper.filter(m => {
    return !allLegacyGroupsIdsInDB.includes(m.pubkeyHex);
  });

  window.log.debug(`allLegacyGroupsInWrapper: ${allLegacyGroupsInWrapper.map(m => m.pubkeyHex)} `);
  window.log.debug(`allLegacyGroupsIdsInDB: ${allLegacyGroupsIdsInDB} `);

  const legacyGroupsToLeaveInDB = allLegacyGroupsInDb.filter(m => {
    return !allLegacyGroupsIdsInWrapper.includes(m.id);
  });
  window.log.info(
    `we have to join ${legacyGroupsToJoinInDB.length} legacy groups in DB compared to what is in the wrapper`
  );

  window.log.info(
    `we have to leave ${legacyGroupsToLeaveInDB.length} legacy groups in DB compared to what is in the wrapper`
  );

  for (let index = 0; index < legacyGroupsToLeaveInDB.length; index++) {
    const toLeave = legacyGroupsToLeaveInDB[index];
    window.log.info(
      'leaving legacy group from configuration sync message with convoId ',
      toLeave.id
    );
    const toLeaveFromDb = getConversationController().get(toLeave.id);
    // the wrapper told us that this group is not tracked, so even if we left/got kicked from it, remove it from the DB completely
    await getConversationController().deleteClosedGroup(toLeaveFromDb.id, {
      fromSyncMessage: true,
      sendLeaveMessage: false, // this comes from the wrapper, so we must have left/got kicked from that group already and our device already handled it.
    });
  }

  for (let index = 0; index < legacyGroupsToJoinInDB.length; index++) {
    const toJoin = legacyGroupsToJoinInDB[index];
    window.log.info(
      'joining legacy group from configuration sync message with convoId ',
      toJoin.pubkeyHex
    );

    // let's just create the required convo here, as we update the fields right below
    await getConversationController().getOrCreateAndWait(
      toJoin.pubkeyHex,
      ConversationTypeEnum.GROUP
    );
  }

  for (let index = 0; index < allLegacyGroupsInWrapper.length; index++) {
    const fromWrapper = allLegacyGroupsInWrapper[index];

    const legacyGroupConvo = getConversationController().get(fromWrapper.pubkeyHex);
    if (!legacyGroupConvo) {
      // this should not happen as we made sure to create them before
      window.log.warn(
        'could not find legacy group which should already be there:',
        fromWrapper.pubkeyHex
      );
      continue;
    }

    const members = fromWrapper.members.map(m => m.pubkeyHex);
    const admins = fromWrapper.members.filter(m => m.isAdmin).map(m => m.pubkeyHex);
    const activeAt = legacyGroupConvo.getActiveAt();
    // then for all the existing legacy group in the wrapper, we need to override the field of what we have in the DB with what is in the wrapper
    // We only set group admins on group creation
    const groupDetails: ClosedGroup.GroupInfo = {
      id: fromWrapper.pubkeyHex,
      name: fromWrapper.name,
      members,
      admins,
      activeAt:
        !!activeAt && activeAt < latestEnvelopeTimestamp
          ? legacyGroupConvo.getActiveAt()
          : latestEnvelopeTimestamp,
    };

    await ClosedGroup.updateOrCreateClosedGroup(groupDetails);

    let changes = await legacyGroupConvo.setPriorityFromWrapper(fromWrapper.priority, false);

    const existingTimestampMs = legacyGroupConvo.getLastJoinedTimestamp();
    const existingJoinedAtSeconds = Math.floor(existingTimestampMs / 1000);
    if (existingJoinedAtSeconds !== fromWrapper.joinedAtSeconds) {
      legacyGroupConvo.set({
        lastJoinedTimestamp: fromWrapper.joinedAtSeconds * 1000,
      });
      changes = true;
    }

    // if (legacyGroupConvo.get('expireTimer') !== fromWrapper.disappearingTimerSeconds) {
    //   await legacyGroupConvo.updateExpireTimer(
    //     fromWrapper.disappearingTimerSeconds,
    //     undefined,
    //     latestEnvelopeTimestamp,
    //     {
    //       fromSync: true,
    //     }
    //   );
    //   changes = true;
    // }
    // start polling for this group if we haven't left it yet. The wrapper does not store this info for legacy group so we check from the DB entry instead
    if (!legacyGroupConvo.isKickedFromGroup() && !legacyGroupConvo.isLeft()) {
      getSwarmPollingInstance().addGroupId(PubKey.cast(fromWrapper.pubkeyHex));

      // save the encryption keypair if needed
      if (!isEmpty(fromWrapper.encPubkey) && !isEmpty(fromWrapper.encSeckey)) {
        try {
          const inWrapperKeypair: HexKeyPair = {
            publicHex: toHex(fromWrapper.encPubkey),
            privateHex: toHex(fromWrapper.encSeckey),
          };

          await addKeyPairToCacheAndDBIfNeeded(fromWrapper.pubkeyHex, inWrapperKeypair);
        } catch (e) {
          window.log.warn('failed to save keypair for legacugroup', fromWrapper.pubkeyHex);
        }
      }
    }

    if (changes) {
      // this commit will grab the latest encryption keypair and add it to the user group wrapper if needed
      await legacyGroupConvo.commit();
    }

    // trigger decrypting of all this group messages we did not decrypt successfully yet.
    await queueAllCachedFromSource(fromWrapper.pubkeyHex);
  }
}

async function handleGroupUpdate(latestEnvelopeTimestamp: number) {
  // first let's check which groups needs to be joined or left by doing a diff of what is in the wrapper and what is in the DB
  const allGoupsInWrapper = await UserGroupsWrapperActions.getAllGroups();

  const allGoupsIdsInWrapper = allGoupsInWrapper.map(m => m.pubkeyHex);
  console.warn('allGoupsIdsInWrapper', stringify(allGoupsIdsInWrapper));

  const userEdKeypair = await UserUtils.getUserED25519KeyPairBytes();
  if (!userEdKeypair) {
    throw new Error('userEdKeypair is not set');
  }

  for (let index = 0; index < allGoupsInWrapper.length; index++) {
    const groupInWrapper = allGoupsInWrapper[index];
    const groupPk = groupInWrapper.pubkeyHex;
    if (!getConversationController().get(groupPk)) {
      try {
        // dump is always empty when creating a new groupInfo
        await MetaGroupWrapperActions.init(groupPk, {
          metaDumped: null,
          userEd25519Secretkey: toFixedUint8ArrayOfLength(userEdKeypair.privKeyBytes, 64),
          groupEd25519Secretkey: groupInWrapper.secretKey,
          groupEd25519Pubkey: toFixedUint8ArrayOfLength(
            HexString.fromHexString(groupPk.slice(2)),
            32
          ),
        });
      } catch (e) {
        window.log.warn(`MetaGroupWrapperActions.init of "${groupPk}" failed with`, e.message);
      }
      const created = await getConversationController().getOrCreateAndWait(
        groupPk,
        ConversationTypeEnum.GROUPV3
      );
      created.set({ active_at: latestEnvelopeTimestamp });
      await created.commit();
      getSwarmPollingInstance().addGroupId(PubKey.cast(groupPk));
    }
  }
}

async function handleUserGroupsUpdate(result: IncomingUserResult) {
  const toHandle = SessionUtilUserGroups.getUserGroupTypes();
  for (let index = 0; index < toHandle.length; index++) {
    const typeToHandle = toHandle[index];
    switch (typeToHandle) {
      case 'Community':
        await handleCommunitiesUpdate();
        break;
      case 'LegacyGroup':
        await handleLegacyGroupUpdate(result.latestEnvelopeTimestamp);
        break;
      case 'Group':
        await handleGroupUpdate(result.latestEnvelopeTimestamp);
        break;

      default:
        assertUnreachable(typeToHandle, `handleUserGroupsUpdate unhandled type "${typeToHandle}"`);
    }
  }
}

async function applyConvoVolatileUpdateFromWrapper(
  convoId: string,
  forcedUnread: boolean,
  lastReadMessageTimestamp: number
) {
  const foundConvo = getConversationController().get(convoId);
  if (!foundConvo) {
    return;
  }

  try {
    // window.log.debug(
    //   `applyConvoVolatileUpdateFromWrapper: ${convoId}: forcedUnread:${forcedUnread}, lastReadMessage:${lastReadMessageTimestamp}`
    // );
    // this should mark all the messages sent before fromWrapper.lastRead as read and update the unreadCount
    await foundConvo.markReadFromConfigMessage(lastReadMessageTimestamp);
    // this commits to the DB, if needed
    await foundConvo.markAsUnread(forcedUnread, true);

    if (SessionUtilConvoInfoVolatile.isConvoToStoreInWrapper(foundConvo)) {
      await SessionUtilConvoInfoVolatile.refreshConvoVolatileCached(
        foundConvo.id,
        foundConvo.isClosedGroup(),
        false
      );

      await foundConvo.refreshInMemoryDetails();
    }
  } catch (e) {
    window.log.warn(
      `applyConvoVolatileUpdateFromWrapper of "${convoId}" failed with error ${e.message}`
    );
  }
}

async function handleConvoInfoVolatileUpdate() {
  const types = SessionUtilConvoInfoVolatile.getConvoInfoVolatileTypes();
  for (let typeIndex = 0; typeIndex < types.length; typeIndex++) {
    const type = types[typeIndex];
    switch (type) {
      case '1o1':
        try {
          // Note: "Note to Self" comes here too
          const wrapper1o1s = await ConvoInfoVolatileWrapperActions.getAll1o1();
          for (let index = 0; index < wrapper1o1s.length; index++) {
            const fromWrapper = wrapper1o1s[index];

            await applyConvoVolatileUpdateFromWrapper(
              fromWrapper.pubkeyHex,
              fromWrapper.unread,
              fromWrapper.lastRead
            );
          }
        } catch (e) {
          window.log.warn('handleConvoInfoVolatileUpdate of "1o1" failed with error: ', e.message);
        }

        break;
      case 'Community':
        try {
          const wrapperComms = await ConvoInfoVolatileWrapperActions.getAllCommunities();
          for (let index = 0; index < wrapperComms.length; index++) {
            const fromWrapper = wrapperComms[index];

            const convoId = getOpenGroupV2ConversationId(
              fromWrapper.baseUrl,
              fromWrapper.roomCasePreserved
            );

            await applyConvoVolatileUpdateFromWrapper(
              convoId,
              fromWrapper.unread,
              fromWrapper.lastRead
            );
          }
        } catch (e) {
          window.log.warn(
            'handleConvoInfoVolatileUpdate of "Community" failed with error: ',
            e.message
          );
        }
        break;

      case 'LegacyGroup':
        try {
          const legacyGroups = await ConvoInfoVolatileWrapperActions.getAllLegacyGroups();
          for (let index = 0; index < legacyGroups.length; index++) {
            const fromWrapper = legacyGroups[index];

            await applyConvoVolatileUpdateFromWrapper(
              fromWrapper.pubkeyHex,
              fromWrapper.unread,
              fromWrapper.lastRead
            );
          }
        } catch (e) {
          window.log.warn(
            'handleConvoInfoVolatileUpdate of "LegacyGroup" failed with error: ',
            e.message
          );
        }
        break;

      case 'Group':
        // debugger; // we need to update the current read messages of that group 03 with what we have in the wrapper // debugger
        break;

      default:
        assertUnreachable(type, `handleConvoInfoVolatileUpdate: unhandeld switch case: ${type}`);
    }
  }
}

async function processUserMergingResults(results: Map<ConfigWrapperUser, IncomingUserResult>) {
  if (!results || !results.size) {
    return;
  }

  const keys = [...results.keys()];
  let anyNeedsPush = false;
  for (let index = 0; index < keys.length; index++) {
    const wrapperType = keys[index];
    const incomingResult = results.get(wrapperType);
    if (!incomingResult) {
      continue;
    }

    try {
      const { kind } = incomingResult;
      switch (kind) {
        case SignalService.SharedConfigMessage.Kind.USER_PROFILE:
          await handleUserProfileUpdate(incomingResult);
          break;
        case SignalService.SharedConfigMessage.Kind.CONTACTS:
          await handleContactsUpdate();
          break;
        case SignalService.SharedConfigMessage.Kind.USER_GROUPS:
          await handleUserGroupsUpdate(incomingResult);
          break;
        case SignalService.SharedConfigMessage.Kind.CONVO_INFO_VOLATILE:
          await handleConvoInfoVolatileUpdate();
          break;
        default:
          try {
            // we catch errors here because an old client knowing about a new type of config coming from the network should not just crash
            assertUnreachable(kind, `processUserMergingResults unsupported kind: "${kind}"`);
          } catch (e) {
            window.log.warn('assertUnreachable failed', e.message);
          }
      }
      const variant = LibSessionUtil.userKindToVariant(kind);
      try {
        await updateLibsessionLatestProcessedUserTimestamp(
          variant,
          incomingResult.latestEnvelopeTimestamp
        );
      } catch (e) {
        window.log.error(`updateLibsessionLatestProcessedUserTimestamp failed with "${e.message}"`);
      }

      if (incomingResult.needsDump) {
        // The config data had changes so regenerate the dump and save it
        const dump = await GenericWrapperActions.dump(variant);
        await ConfigDumpData.saveConfigDump({
          data: dump,
          publicKey: incomingResult.publicKey,
          variant,
        });
      }

      if (incomingResult.needsPush) {
        anyNeedsPush = true;
      }
    } catch (e) {
      window.log.error(`processMergingResults failed with ${e.message}`);
      return;
    }
  }
  // Now that the local state has been updated, trigger a config sync (this will push any
  // pending updates and properly update the state)
  if (anyNeedsPush) {
    await ConfigurationSync.queueNewJobIfNeeded();
  }
}

async function handleUserConfigMessagesViaLibSession(
  configMessages: Array<IncomingMessage<SignalService.ISharedConfigMessage>>
) {
  if (isEmpty(configMessages)) {
    return;
  }

  window?.log?.debug(
    `Handling our sharedConfig message via libsession_util ${JSON.stringify(
      configMessages.map(m => ({
        kind: m.message.kind,
        hash: m.messageHash,
        seqno: (m.message.seqno as Long).toNumber(),
      }))
    )}`
  );

  const incomingMergeResult = await mergeUserConfigsWithIncomingUpdates(configMessages);
  await processUserMergingResults(incomingMergeResult);
}

async function updateOurProfileViaLibSession(
  sentAt: number,
  displayName: string,
  profileUrl: string | null,
  profileKey: Uint8Array | null,
  priority: number | null // passing null means to not update the priority at all (used for legacy config message for now)
) {
  await ProfileManager.updateOurProfileSync(displayName, profileUrl, profileKey, priority);

  await setLastProfileUpdateTimestamp(toNumber(sentAt));
  // do not trigger a signin by linking if the display name is empty
  if (!isEmpty(displayName)) {
    trigger(configurationMessageReceived, displayName);
  } else {
    window?.log?.warn('Got a configuration message but the display name is empty');
  }
}

export const ConfigMessageHandler = {
  handleUserConfigMessagesViaLibSession,
};
