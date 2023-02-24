import { difference, omit } from 'lodash';
import Long from 'long';
import { UserUtils } from '..';
import { ConfigDumpData } from '../../../data/configDump/configDump';
import { SignalService } from '../../../protobuf';
import { ConfigWrapperObjectTypes } from '../../../webworker/workers/browser/libsession_worker_functions';
import { GenericWrapperActions } from '../../../webworker/workers/browser/libsession_worker_interface';
import { GetNetworkTime } from '../../apis/snode_api/getNetworkTime';
import { SnodeNamespaces } from '../../apis/snode_api/namespaces';
import { SharedConfigMessage } from '../../messages/outgoing/controlMessage/SharedConfigMessage';
import { ConfigurationSync } from '../job_runners/jobs/ConfigurationSyncJob';
import { SessionUtilContact } from './libsession_utils_contacts';
import { SessionUtilUserGroups } from './libsession_utils_user_groups';
import { SessionUtilUserProfile } from './libsession_utils_user_profile';

// TODO complete this list
const requiredUserDumpVariants: Array<ConfigWrapperObjectTypes> = [
  'UserConfig',
  'ContactsConfig',
  'UserGroupsConfig',
];

export type IncomingConfResult = {
  needsPush: boolean;
  needsDump: boolean;
  messageHashes: Array<string>;
  latestSentTimestamp: number;
};

export type OutgoingConfResult = {
  message: SharedConfigMessage;
  namespace: SnodeNamespaces;
  destination: string;
  oldMessageHashes: Array<string>;
};

async function initializeLibSessionUtilWrappers() {
  const keypair = await UserUtils.getUserED25519KeyPairBytes();
  if (!keypair || !keypair.privKeyBytes) {
    throw new Error('edkeypair not found for current user');
  }
  const privateKeyEd25519 = keypair.privKeyBytes;
  // let's plan a sync on start for now
  // TODO is this causing any issues?
  setTimeout(() => ConfigurationSync.queueNewJobIfNeeded, 3000);

  // fetch the dumps we already have from the database
  const dumps = await ConfigDumpData.getAllDumpsWithData();
  console.warn(
    'initializeLibSessionUtilWrappers alldumpsInDB already: ',
    dumps.map(m => omit(m, 'data'))
  );

  const userVariantsBuildWithoutErrors = new Set<ConfigWrapperObjectTypes>();

  // load the dumps retrieved from the database into their corresponding wrappers
  for (let index = 0; index < dumps.length; index++) {
    const dump = dumps[index];
    console.warn('initializeLibSessionUtilWrappers initing from dump', dump.variant);
    try {
      await GenericWrapperActions.init(
        dump.variant,
        privateKeyEd25519,
        dump.data.length ? dump.data : null
      );

      userVariantsBuildWithoutErrors.add(dump.variant);
    } catch (e) {
      window.log.warn(`init of UserConfig failed with ${e.message} `);
      throw new Error(`initializeLibSessionUtilWrappers failed with ${e.message}`);
    }
  }

  // TODO
  console.warn('requiredVariants: FIXME add conversation volatile wrapper as required ');

  const missingRequiredVariants: Array<ConfigWrapperObjectTypes> = difference(
    requiredUserDumpVariants,
    [...userVariantsBuildWithoutErrors.values()]
  );

  if (missingRequiredVariants.length) {
    // TODO this is only needed for debugging. Should be removed as we force them created right below with an empty dump
    throw new Error(`missingRequiredVariants: ${JSON.stringify(missingRequiredVariants)}`);
  }

  for (let index = 0; index < missingRequiredVariants.length; index++) {
    const missingVariant = missingRequiredVariants[index];
    await GenericWrapperActions.init(missingVariant, privateKeyEd25519, null);
  }
}

async function pendingChangesForPubkey(pubkey: string): Promise<Array<OutgoingConfResult>> {
  const dumps = await ConfigDumpData.getAllDumpsWithoutData();
  const us = UserUtils.getOurPubKeyStrFromCache();

  // Ensure we always check the required user config types for changes even if there is no dump
  // data yet (to deal with first launch cases)
  if (pubkey === us) {
    LibSessionUtil.requiredUserDumpVariants.forEach(requiredVariant => {
      if (!dumps.find(m => m.publicKey === us && m.variant === requiredVariant)) {
        dumps.push({
          publicKey: us,
          variant: requiredVariant,
        });
      }
    });
  }

  const results: Array<OutgoingConfResult> = [];

  for (let index = 0; index < dumps.length; index++) {
    const dump = dumps[index];
    const variant = dump.variant;
    const needsPush = await GenericWrapperActions.needsPush(variant);
    if (!needsPush) {
      continue;
    }

    const { data, seqno, hashes } = await GenericWrapperActions.push(variant);

    const kind = variantToKind(variant);
    const namespace = await GenericWrapperActions.storageNamespace(variant);
    results.push({
      destination: pubkey,
      message: new SharedConfigMessage({
        data,
        kind,
        seqno: Long.fromNumber(seqno),
        timestamp: GetNetworkTime.getNowWithNetworkOffset(),
      }),
      oldMessageHashes: hashes,
      namespace,
    });
  }

  return results;
}

function kindToVariant(kind: SignalService.SharedConfigMessage.Kind): ConfigWrapperObjectTypes {
  switch (kind) {
    case SignalService.SharedConfigMessage.Kind.USER_PROFILE:
      return 'UserConfig';
    case SignalService.SharedConfigMessage.Kind.CONTACTS:
      return 'ContactsConfig';
    case SignalService.SharedConfigMessage.Kind.USER_GROUPS:
      return 'UserGroupsConfig';
    default:
      throw new Error(`kindToVariant: Unsupported variant: "${kind}"`);
  }
}

function variantToKind(variant: ConfigWrapperObjectTypes): SignalService.SharedConfigMessage.Kind {
  switch (variant) {
    case 'UserConfig':
      return SignalService.SharedConfigMessage.Kind.USER_PROFILE;
    case 'ContactsConfig':
      return SignalService.SharedConfigMessage.Kind.CONTACTS;
    case 'UserGroupsConfig':
      return SignalService.SharedConfigMessage.Kind.USER_GROUPS;
    default:
      throw new Error(`variantToKind: Unsupported kind: "${variant}"`);
  }
}

/**
 * Returns true if the config needs to be dumped afterwards
 */
async function markAsPushed(
  variant: ConfigWrapperObjectTypes,
  pubkey: string,
  seqno: number,
  hash: string
) {
  if (pubkey !== UserUtils.getOurPubKeyStrFromCache()) {
    throw new Error('FIXME, generic case is to be done');
  }
  await GenericWrapperActions.confirmPushed(variant, seqno, hash);
  return GenericWrapperActions.needsDump(variant);
}

export const LibSessionUtil = {
  initializeLibSessionUtilWrappers,
  requiredUserDumpVariants,
  pendingChangesForPubkey,
  insertUserProfileIntoWrapper: SessionUtilUserProfile.insertUserProfileIntoWrapper,
  insertAllContactsIntoContactsWrapper: SessionUtilContact.insertAllContactsIntoContactsWrapper,
  insertAllUserGroupsIntoWrapper: SessionUtilUserGroups.insertAllUserGroupsIntoWrapper,
  removeCommunityFromWrapper: SessionUtilUserGroups.removeCommunityFromWrapper,
  kindToVariant,
  markAsPushed,
};