/* eslint-disable no-await-in-loop */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
import { GroupPubkeyType } from 'libsession_util_nodejs';
import { compact, difference, omit } from 'lodash';
import Long from 'long';
import { UserUtils } from '..';
import { ConfigDumpData } from '../../../data/configDump/configDump';
import { assertUnreachable } from '../../../types/sqlSharedTypes';
import {
  ConfigWrapperGroupDetailed,
  ConfigWrapperUser,
  isUserConfigWrapperType,
} from '../../../webworker/workers/browser/libsession_worker_functions';
import {
  GenericWrapperActions,
  MetaGroupWrapperActions,
} from '../../../webworker/workers/browser/libsession_worker_interface';
import { SnodeNamespaces, UserConfigNamespaces } from '../../apis/snode_api/namespaces';
import { ed25519Str } from '../../onions/onionPath';
import { PubKey } from '../../types';
import { ConfigurationSync } from '../job_runners/jobs/ConfigurationSyncJob';

const requiredUserVariants: Array<ConfigWrapperUser> = [
  'UserConfig',
  'ContactsConfig',
  'UserGroupsConfig',
  'ConvoInfoVolatileConfig',
];

async function initializeLibSessionUtilWrappers() {
  const keypair = await UserUtils.getUserED25519KeyPairBytes();
  if (!keypair || !keypair.privKeyBytes) {
    throw new Error('edkeypair not found for current user');
  }
  const privateKeyEd25519 = keypair.privKeyBytes;
  // let's plan a sync on start with some room for the app to be ready
  setTimeout(() => ConfigurationSync.queueNewJobIfNeeded, 20000);

  // fetch the dumps we already have from the database
  const dumps = await ConfigDumpData.getAllDumpsWithData();
  window.log.info(
    'initializeLibSessionUtilWrappers alldumpsInDB already: ',
    JSON.stringify(dumps.map(m => omit(m, 'data')))
  );

  const userVariantsBuildWithoutErrors = new Set<ConfigWrapperUser>();

  // load the dumps retrieved from the database into their corresponding wrappers
  for (let index = 0; index < dumps.length; index++) {
    const dump = dumps[index];
    const variant = dump.variant;
    if (!isUserConfigWrapperType(variant)) {
      continue;
    }
    window.log.debug('initializeLibSessionUtilWrappers initing from dump', variant);
    try {
      await GenericWrapperActions.init(
        variant,
        privateKeyEd25519,
        dump.data.length ? dump.data : null
      );

      userVariantsBuildWithoutErrors.add(variant);
    } catch (e) {
      window.log.warn(`init of UserConfig failed with ${e.message} `);
      throw new Error(`initializeLibSessionUtilWrappers failed with ${e.message}`);
    }
  }

  const missingRequiredVariants: Array<ConfigWrapperUser> = difference(
    LibSessionUtil.requiredUserVariants,
    [...userVariantsBuildWithoutErrors.values()]
  );

  for (let index = 0; index < missingRequiredVariants.length; index++) {
    const missingVariant = missingRequiredVariants[index];
    window.log.warn(
      `initializeLibSessionUtilWrappers: missingRequiredVariants "${missingVariant}"`
    );
    await GenericWrapperActions.init(missingVariant, privateKeyEd25519, null);
    // save the newly created dump to the database even if it is empty, just so we do not need to recreate one next run

    const dump = await GenericWrapperActions.dump(missingVariant);
    await ConfigDumpData.saveConfigDump({
      data: dump,
      publicKey: UserUtils.getOurPubKeyStrFromCache(),
      variant: missingVariant,
    });
    window.log.debug(
      `initializeLibSessionUtilWrappers: missingRequiredVariants "${missingVariant}" created`
    );
  }

  // No need to load the meta group wrapper here. We will load them once the SessionInbox is loaded with a redux action
}

export type PendingChangesForUs = {
  ciphertext: Uint8Array;
  seqno: Long;
  namespace: UserConfigNamespaces;
};

type PendingChangesForGroupNonKey = {
  data: Uint8Array;
  seqno: Long;
  namespace: SnodeNamespaces.ClosedGroupInfo | SnodeNamespaces.ClosedGroupMembers;
  type: Extract<ConfigWrapperGroupDetailed, 'GroupInfo' | 'GroupMember'>;
};

type PendingChangesForGroupKey = {
  data: Uint8Array;
  namespace: SnodeNamespaces.ClosedGroupKeys;
  type: Extract<ConfigWrapperGroupDetailed, 'GroupKeys'>;
};

export type PendingChangesForGroup = PendingChangesForGroupNonKey | PendingChangesForGroupKey;

type SingleDestinationChanges<T extends PendingChangesForGroup | PendingChangesForUs> = {
  messages: Array<T>;
  allOldHashes: Set<string>;
};

export type UserSingleDestinationChanges = SingleDestinationChanges<PendingChangesForUs>;
export type GroupSingleDestinationChanges = SingleDestinationChanges<PendingChangesForGroup>;

async function pendingChangesForUs(): Promise<UserSingleDestinationChanges> {
  const us = UserUtils.getOurPubKeyStrFromCache();
  const dumps = await ConfigDumpData.getAllDumpsWithoutDataFor(us);

  // Ensure we always check the required user config types for changes even if there is no dump
  // data yet (to deal with first launch cases)
  LibSessionUtil.requiredUserVariants.forEach(requiredVariant => {
    if (!dumps.some(m => m.publicKey === us && m.variant === requiredVariant)) {
      dumps.push({
        publicKey: us,
        variant: requiredVariant,
      });
    }
  });

  const results: UserSingleDestinationChanges = { messages: [], allOldHashes: new Set() };
  const variantsNeedingPush = new Set<ConfigWrapperUser>();

  for (let index = 0; index < dumps.length; index++) {
    const dump = dumps[index];
    const variant = dump.variant;
    if (!isUserConfigWrapperType(variant)) {
      // this shouldn't happen for our pubkey.
      continue;
    }
    const needsPush = await GenericWrapperActions.needsPush(variant);
    if (!needsPush) {
      continue;
    }

    variantsNeedingPush.add(variant);
    const { data, seqno, hashes, namespace } = await GenericWrapperActions.push(variant);

    results.messages.push({
      ciphertext: data,
      seqno: Long.fromNumber(seqno),
      namespace,
    });

    hashes.forEach(hash => {
      results.allOldHashes.add(hash);
    });
  }
  window.log.info(`those variants needs push: "${[...variantsNeedingPush]}"`);

  return results;
}

// we link the namespace to the type of what each wrapper needs

async function pendingChangesForGroup(
  groupPk: GroupPubkeyType
): Promise<GroupSingleDestinationChanges> {
  if (!PubKey.isClosedGroupV2(groupPk)) {
    throw new Error(`pendingChangesForGroup only works for user or 03 group pubkeys`);
  }
  // one of the wrapper behind the metagroup needs a push
  const needsPush = await MetaGroupWrapperActions.needsPush(groupPk);

  // we probably need to add the GROUP_KEYS check here

  if (!needsPush) {
    return { messages: [], allOldHashes: new Set() };
  }
  const { groupInfo, groupMember, groupKeys } = await MetaGroupWrapperActions.push(groupPk);
  const results = new Array<PendingChangesForGroup>();

  // Note: We need the keys to be pushed first to avoid a race condition
  if (groupKeys) {
    results.push({
      type: 'GroupKeys',
      data: groupKeys.data,
      namespace: groupKeys.namespace,
    });
  }

  if (groupInfo) {
    results.push({
      type: 'GroupInfo',
      data: groupInfo.data,
      seqno: Long.fromNumber(groupInfo.seqno),
      namespace: groupInfo.namespace,
    });
  }
  if (groupMember) {
    results.push({
      type: 'GroupMember',
      data: groupMember.data,
      seqno: Long.fromNumber(groupMember.seqno),
      namespace: groupMember.namespace,
    });
  }
  window.log.debug(
    `${ed25519Str(groupPk)} those group variants needs push: "${results.map(m => m.type)}"`
  );

  const memberHashes = compact(groupMember?.hashes) || [];
  const infoHashes = compact(groupInfo?.hashes) || [];
  const allOldHashes = new Set([...infoHashes, ...memberHashes]);

  return { messages: results, allOldHashes };
}

function userNamespaceToVariant(namespace: UserConfigNamespaces) {
  switch (namespace) {
    case SnodeNamespaces.UserProfile:
      return 'UserConfig';
    case SnodeNamespaces.UserContacts:
      return 'ContactsConfig';
    case SnodeNamespaces.UserGroups:
      return 'UserGroupsConfig';
    case SnodeNamespaces.ConvoInfoVolatile:
      return 'ConvoInfoVolatileConfig';
    default:
      assertUnreachable(namespace, `userNamespaceToVariant: Unsupported namespace: "${namespace}"`);
      throw new Error('userNamespaceToVariant: Unsupported namespace:');
  }
}

/**
 * Returns true if the config needs to be dumped afterwards
 */
async function markAsPushed(variant: ConfigWrapperUser, seqno: number, hash: string) {
  await GenericWrapperActions.confirmPushed(variant, seqno, hash);
  return GenericWrapperActions.needsDump(variant);
}

/**
 * If a dump is needed for that metagroup wrapper, dump it to the Database
 */
async function saveMetaGroupDumpToDb(groupPk: GroupPubkeyType) {
  const metaNeedsDump = await MetaGroupWrapperActions.needsDump(groupPk);
  // save the concatenated dumps as a single entry in the DB if any of the dumps had a need for dump
  if (metaNeedsDump) {
    const dump = await MetaGroupWrapperActions.metaDump(groupPk);
    await ConfigDumpData.saveConfigDump({
      data: dump,
      publicKey: groupPk,
      variant: `MetaGroupConfig-${groupPk}`,
    });
    window.log.debug(`Saved dumps for metagroup ${ed25519Str(groupPk)}`);
  } else {
    window.log.debug(`No need to update local dumps for metagroup ${ed25519Str(groupPk)}`);
  }
}

export const LibSessionUtil = {
  initializeLibSessionUtilWrappers,
  userNamespaceToVariant,
  requiredUserVariants,
  pendingChangesForUs,
  pendingChangesForGroup,
  markAsPushed,
  saveMetaGroupDumpToDb,
};
