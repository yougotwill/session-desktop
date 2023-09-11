/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
import {
  GroupWrapperConstructor,
  ContactInfoSet,
  ContactsWrapperActionsCalls,
  ConvoInfoVolatileWrapperActionsCalls,
  GenericWrapperActionsCall,
  GroupInfoSet,
  GroupPubkeyType,
  LegacyGroupInfo,
  MetaGroupWrapperActionsCalls,
  ProfilePicture,
  UserConfigWrapperActionsCalls,
  UserGroupsWrapperActionsCalls,
  UserGroupsSet,
} from 'libsession_util_nodejs';
import { join } from 'path';

import { getAppRootPath } from '../../../node/getRootPath';
import { WorkerInterface } from '../../worker_interface';
import { ConfigWrapperUser, LibSessionWorkerFunctions } from './libsession_worker_functions';

let libsessionWorkerInterface: WorkerInterface | undefined;

const internalCallLibSessionWorker = async ([
  config,
  fnName,
  ...args
]: LibSessionWorkerFunctions): Promise<unknown> => {
  if (!libsessionWorkerInterface) {
    const libsessionWorkerPath = join(
      getAppRootPath(),
      'ts',
      'webworker',
      'workers',
      'node',
      'libsession',
      'libsession.worker.compiled.js'
    );

    libsessionWorkerInterface = new WorkerInterface(libsessionWorkerPath, 1 * 60 * 1000);
  }
  const result = libsessionWorkerInterface?.callWorker(config, fnName, ...args);

  return result;
};

type GenericWrapperActionsCalls = {
  init: (
    wrapperId: ConfigWrapperUser,
    ed25519Key: Uint8Array,
    dump: Uint8Array | null
  ) => Promise<void>;
  confirmPushed: GenericWrapperActionsCall<ConfigWrapperUser, 'confirmPushed'>;
  dump: GenericWrapperActionsCall<ConfigWrapperUser, 'dump'>;
  merge: GenericWrapperActionsCall<ConfigWrapperUser, 'merge'>;
  needsDump: GenericWrapperActionsCall<ConfigWrapperUser, 'needsDump'>;
  needsPush: GenericWrapperActionsCall<ConfigWrapperUser, 'needsPush'>;
  push: GenericWrapperActionsCall<ConfigWrapperUser, 'push'>;
  currentHashes: GenericWrapperActionsCall<ConfigWrapperUser, 'currentHashes'>;
};

// TODO rename this to a UserWrapperActions or UserGenericWrapperActions as those actions are only used for User Wrappers now
export const GenericWrapperActions: GenericWrapperActionsCalls = {
  /** base wrapper generic actions */

  init: async (wrapperId: ConfigWrapperUser, ed25519Key: Uint8Array, dump: Uint8Array | null) =>
    callLibSessionWorker([wrapperId, 'init', ed25519Key, dump]) as ReturnType<
      GenericWrapperActionsCalls['init']
    >,

  confirmPushed: async (wrapperId: ConfigWrapperUser, seqno: number, hash: string) =>
    callLibSessionWorker([wrapperId, 'confirmPushed', seqno, hash]) as ReturnType<
      GenericWrapperActionsCalls['confirmPushed']
    >,
  dump: async (wrapperId: ConfigWrapperUser) =>
    callLibSessionWorker([wrapperId, 'dump']) as ReturnType<GenericWrapperActionsCalls['dump']>,
  merge: async (wrapperId: ConfigWrapperUser, toMerge: Array<{ hash: string; data: Uint8Array }>) =>
    callLibSessionWorker([wrapperId, 'merge', toMerge]) as ReturnType<
      GenericWrapperActionsCalls['merge']
    >,
  needsDump: async (wrapperId: ConfigWrapperUser) =>
    callLibSessionWorker([wrapperId, 'needsDump']) as ReturnType<
      GenericWrapperActionsCalls['needsDump']
    >,
  needsPush: async (wrapperId: ConfigWrapperUser) =>
    callLibSessionWorker([wrapperId, 'needsPush']) as ReturnType<
      GenericWrapperActionsCalls['needsPush']
    >,
  push: async (wrapperId: ConfigWrapperUser) =>
    callLibSessionWorker([wrapperId, 'push']) as ReturnType<GenericWrapperActionsCalls['push']>,
  currentHashes: async (wrapperId: ConfigWrapperUser) =>
    callLibSessionWorker([wrapperId, 'currentHashes']) as ReturnType<
      GenericWrapperActionsCalls['currentHashes']
    >,
};

export const UserConfigWrapperActions: UserConfigWrapperActionsCalls = {
  /* Reuse the GenericWrapperActions with the UserConfig argument */
  init: async (ed25519Key: Uint8Array, dump: Uint8Array | null) =>
    GenericWrapperActions.init('UserConfig', ed25519Key, dump),
  confirmPushed: async (seqno: number, hash: string) =>
    GenericWrapperActions.confirmPushed('UserConfig', seqno, hash),
  dump: async () => GenericWrapperActions.dump('UserConfig'),
  merge: async (toMerge: Array<{ hash: string; data: Uint8Array }>) =>
    GenericWrapperActions.merge('UserConfig', toMerge),
  needsDump: async () => GenericWrapperActions.needsDump('UserConfig'),
  needsPush: async () => GenericWrapperActions.needsPush('UserConfig'),
  push: async () => GenericWrapperActions.push('UserConfig'),
  currentHashes: async () => GenericWrapperActions.currentHashes('UserConfig'),

  /** UserConfig wrapper specific actions */
  getUserInfo: async () =>
    callLibSessionWorker(['UserConfig', 'getUserInfo']) as Promise<
      ReturnType<UserConfigWrapperActionsCalls['getUserInfo']>
    >,
  setUserInfo: async (
    name: string,
    priority: number,
    profilePic: { url: string; key: Uint8Array } | null
    // expireSeconds: number,
  ) =>
    callLibSessionWorker([
      'UserConfig',
      'setUserInfo',
      name,
      priority,
      profilePic,
      // expireSeconds,
    ]) as Promise<ReturnType<UserConfigWrapperActionsCalls['setUserInfo']>>,

  getEnableBlindedMsgRequest: async () =>
    callLibSessionWorker(['UserConfig', 'getEnableBlindedMsgRequest']) as Promise<
      ReturnType<UserConfigWrapperActionsCalls['getEnableBlindedMsgRequest']>
    >,
  setEnableBlindedMsgRequest: async (blindedMsgRequests: boolean) =>
    callLibSessionWorker([
      'UserConfig',
      'setEnableBlindedMsgRequest',
      blindedMsgRequests,
    ]) as Promise<ReturnType<UserConfigWrapperActionsCalls['setEnableBlindedMsgRequest']>>,
};

export const ContactsWrapperActions: ContactsWrapperActionsCalls = {
  /* Reuse the GenericWrapperActions with the ContactConfig argument */
  init: async (ed25519Key: Uint8Array, dump: Uint8Array | null) =>
    GenericWrapperActions.init('ContactsConfig', ed25519Key, dump),
  confirmPushed: async (seqno: number, hash: string) =>
    GenericWrapperActions.confirmPushed('ContactsConfig', seqno, hash),
  dump: async () => GenericWrapperActions.dump('ContactsConfig'),
  merge: async (toMerge: Array<{ hash: string; data: Uint8Array }>) =>
    GenericWrapperActions.merge('ContactsConfig', toMerge),
  needsDump: async () => GenericWrapperActions.needsDump('ContactsConfig'),
  needsPush: async () => GenericWrapperActions.needsPush('ContactsConfig'),
  push: async () => GenericWrapperActions.push('ContactsConfig'),
  currentHashes: async () => GenericWrapperActions.currentHashes('ContactsConfig'),

  /** ContactsConfig wrapper specific actions */
  get: async (pubkeyHex: string) =>
    callLibSessionWorker(['ContactsConfig', 'get', pubkeyHex]) as Promise<
      ReturnType<ContactsWrapperActionsCalls['get']>
    >,
  getAll: async () =>
    callLibSessionWorker(['ContactsConfig', 'getAll']) as Promise<
      ReturnType<ContactsWrapperActionsCalls['getAll']>
    >,

  erase: async (pubkeyHex: string) =>
    callLibSessionWorker(['ContactsConfig', 'erase', pubkeyHex]) as Promise<
      ReturnType<ContactsWrapperActionsCalls['erase']>
    >,

  set: async (contact: ContactInfoSet) =>
    callLibSessionWorker(['ContactsConfig', 'set', contact]) as Promise<
      ReturnType<ContactsWrapperActionsCalls['set']>
    >,
};

export const UserGroupsWrapperActions: UserGroupsWrapperActionsCalls = {
  /* Reuse the GenericWrapperActions with the ContactConfig argument */
  init: async (ed25519Key: Uint8Array, dump: Uint8Array | null) =>
    GenericWrapperActions.init('UserGroupsConfig', ed25519Key, dump),
  confirmPushed: async (seqno: number, hash: string) =>
    GenericWrapperActions.confirmPushed('UserGroupsConfig', seqno, hash),
  dump: async () => GenericWrapperActions.dump('UserGroupsConfig'),
  merge: async (toMerge: Array<{ hash: string; data: Uint8Array }>) =>
    GenericWrapperActions.merge('UserGroupsConfig', toMerge),
  needsDump: async () => GenericWrapperActions.needsDump('UserGroupsConfig'),
  needsPush: async () => GenericWrapperActions.needsPush('UserGroupsConfig'),
  push: async () => GenericWrapperActions.push('UserGroupsConfig'),
  currentHashes: async () => GenericWrapperActions.currentHashes('UserGroupsConfig'),

  /** UserGroups wrapper specific actions */

  getCommunityByFullUrl: async (fullUrlWithOrWithoutPubkey: string) =>
    callLibSessionWorker([
      'UserGroupsConfig',
      'getCommunityByFullUrl',
      fullUrlWithOrWithoutPubkey,
    ]) as Promise<ReturnType<UserGroupsWrapperActionsCalls['getCommunityByFullUrl']>>,

  setCommunityByFullUrl: async (fullUrl: string, priority: number) =>
    callLibSessionWorker([
      'UserGroupsConfig',
      'setCommunityByFullUrl',
      fullUrl,
      priority,
    ]) as Promise<ReturnType<UserGroupsWrapperActionsCalls['setCommunityByFullUrl']>>,

  getAllCommunities: async () =>
    callLibSessionWorker(['UserGroupsConfig', 'getAllCommunities']) as Promise<
      ReturnType<UserGroupsWrapperActionsCalls['getAllCommunities']>
    >,

  eraseCommunityByFullUrl: async (fullUrlWithoutPubkey: string) =>
    callLibSessionWorker([
      'UserGroupsConfig',
      'eraseCommunityByFullUrl',
      fullUrlWithoutPubkey,
    ]) as Promise<ReturnType<UserGroupsWrapperActionsCalls['eraseCommunityByFullUrl']>>,

  buildFullUrlFromDetails: async (baseUrl: string, roomId: string, pubkeyHex: string) =>
    callLibSessionWorker([
      'UserGroupsConfig',
      'buildFullUrlFromDetails',
      baseUrl,
      roomId,
      pubkeyHex,
    ]) as Promise<ReturnType<UserGroupsWrapperActionsCalls['buildFullUrlFromDetails']>>,

  getLegacyGroup: async (pubkeyHex: string) =>
    callLibSessionWorker(['UserGroupsConfig', 'getLegacyGroup', pubkeyHex]) as Promise<
      ReturnType<UserGroupsWrapperActionsCalls['getLegacyGroup']>
    >,
  getAllLegacyGroups: async () =>
    callLibSessionWorker(['UserGroupsConfig', 'getAllLegacyGroups']) as Promise<
      ReturnType<UserGroupsWrapperActionsCalls['getAllLegacyGroups']>
    >,

  setLegacyGroup: async (info: LegacyGroupInfo) =>
    callLibSessionWorker(['UserGroupsConfig', 'setLegacyGroup', info]) as Promise<
      ReturnType<UserGroupsWrapperActionsCalls['setLegacyGroup']>
    >,

  eraseLegacyGroup: async (pubkeyHex: string) =>
    callLibSessionWorker(['UserGroupsConfig', 'eraseLegacyGroup', pubkeyHex]) as Promise<
      ReturnType<UserGroupsWrapperActionsCalls['eraseLegacyGroup']>
    >,

  createGroup: async () =>
    callLibSessionWorker(['UserGroupsConfig', 'createGroup']) as Promise<
      ReturnType<UserGroupsWrapperActionsCalls['createGroup']>
    >,

  getGroup: async (pubkeyHex: GroupPubkeyType) =>
    callLibSessionWorker(['UserGroupsConfig', 'getGroup', pubkeyHex]) as Promise<
      ReturnType<UserGroupsWrapperActionsCalls['getGroup']>
    >,

  getAllGroups: async () =>
    callLibSessionWorker(['UserGroupsConfig', 'getAllGroups']) as Promise<
      ReturnType<UserGroupsWrapperActionsCalls['getAllGroups']>
    >,

  setGroup: async (info: UserGroupsSet) =>
    callLibSessionWorker(['UserGroupsConfig', 'setGroup', info]) as Promise<
      ReturnType<UserGroupsWrapperActionsCalls['setGroup']>
    >,

  eraseGroup: async (pubkeyHex: GroupPubkeyType) =>
    callLibSessionWorker(['UserGroupsConfig', 'eraseGroup', pubkeyHex]) as Promise<
      ReturnType<UserGroupsWrapperActionsCalls['eraseGroup']>
    >,
};

export const ConvoInfoVolatileWrapperActions: ConvoInfoVolatileWrapperActionsCalls = {
  /* Reuse the GenericWrapperActions with the ContactConfig argument */
  init: async (ed25519Key: Uint8Array, dump: Uint8Array | null) =>
    GenericWrapperActions.init('ConvoInfoVolatileConfig', ed25519Key, dump),
  confirmPushed: async (seqno: number, hash: string) =>
    GenericWrapperActions.confirmPushed('ConvoInfoVolatileConfig', seqno, hash),
  dump: async () => GenericWrapperActions.dump('ConvoInfoVolatileConfig'),
  merge: async (toMerge: Array<{ hash: string; data: Uint8Array }>) =>
    GenericWrapperActions.merge('ConvoInfoVolatileConfig', toMerge),
  needsDump: async () => GenericWrapperActions.needsDump('ConvoInfoVolatileConfig'),
  needsPush: async () => GenericWrapperActions.needsPush('ConvoInfoVolatileConfig'),
  push: async () => GenericWrapperActions.push('ConvoInfoVolatileConfig'),
  currentHashes: async () => GenericWrapperActions.currentHashes('ConvoInfoVolatileConfig'),

  /** ConvoInfoVolatile wrapper specific actions */
  // 1o1
  get1o1: async (pubkeyHex: string) =>
    callLibSessionWorker(['ConvoInfoVolatileConfig', 'get1o1', pubkeyHex]) as Promise<
      ReturnType<ConvoInfoVolatileWrapperActionsCalls['get1o1']>
    >,

  getAll1o1: async () =>
    callLibSessionWorker(['ConvoInfoVolatileConfig', 'getAll1o1']) as Promise<
      ReturnType<ConvoInfoVolatileWrapperActionsCalls['getAll1o1']>
    >,

  set1o1: async (pubkeyHex: string, lastRead: number, unread: boolean) =>
    callLibSessionWorker([
      'ConvoInfoVolatileConfig',
      'set1o1',
      pubkeyHex,
      lastRead,
      unread,
    ]) as Promise<ReturnType<ConvoInfoVolatileWrapperActionsCalls['set1o1']>>,

  erase1o1: async (pubkeyHex: string) =>
    callLibSessionWorker(['ConvoInfoVolatileConfig', 'erase1o1', pubkeyHex]) as Promise<
      ReturnType<ConvoInfoVolatileWrapperActionsCalls['erase1o1']>
    >,

  // legacy groups
  getLegacyGroup: async (pubkeyHex: string) =>
    callLibSessionWorker(['ConvoInfoVolatileConfig', 'getLegacyGroup', pubkeyHex]) as Promise<
      ReturnType<ConvoInfoVolatileWrapperActionsCalls['getLegacyGroup']>
    >,

  getAllLegacyGroups: async () =>
    callLibSessionWorker(['ConvoInfoVolatileConfig', 'getAllLegacyGroups']) as Promise<
      ReturnType<ConvoInfoVolatileWrapperActionsCalls['getAllLegacyGroups']>
    >,

  setLegacyGroup: async (pubkeyHex: string, lastRead: number, unread: boolean) =>
    callLibSessionWorker([
      'ConvoInfoVolatileConfig',
      'setLegacyGroup',
      pubkeyHex,
      lastRead,
      unread,
    ]) as Promise<ReturnType<ConvoInfoVolatileWrapperActionsCalls['setLegacyGroup']>>,

  eraseLegacyGroup: async (pubkeyHex: string) =>
    callLibSessionWorker(['ConvoInfoVolatileConfig', 'eraseLegacyGroup', pubkeyHex]) as Promise<
      ReturnType<ConvoInfoVolatileWrapperActionsCalls['eraseLegacyGroup']>
    >,

  // communities
  getCommunity: async (communityFullUrl: string) =>
    callLibSessionWorker(['ConvoInfoVolatileConfig', 'getCommunity', communityFullUrl]) as Promise<
      ReturnType<ConvoInfoVolatileWrapperActionsCalls['getCommunity']>
    >,

  getAllCommunities: async () =>
    callLibSessionWorker(['ConvoInfoVolatileConfig', 'getAllCommunities']) as Promise<
      ReturnType<ConvoInfoVolatileWrapperActionsCalls['getAllCommunities']>
    >,

  setCommunityByFullUrl: async (fullUrlWithPubkey: string, lastRead: number, unread: boolean) =>
    callLibSessionWorker([
      'ConvoInfoVolatileConfig',
      'setCommunityByFullUrl',
      fullUrlWithPubkey,
      lastRead,
      unread,
    ]) as Promise<ReturnType<ConvoInfoVolatileWrapperActionsCalls['setCommunityByFullUrl']>>,

  eraseCommunityByFullUrl: async (fullUrlWithOrWithoutPubkey: string) =>
    callLibSessionWorker([
      'ConvoInfoVolatileConfig',
      'eraseCommunityByFullUrl',
      fullUrlWithOrWithoutPubkey,
    ]) as Promise<ReturnType<ConvoInfoVolatileWrapperActionsCalls['eraseCommunityByFullUrl']>>,
};

export const MetaGroupWrapperActions: MetaGroupWrapperActionsCalls = {
  /** Shared actions */
  init: async (groupPk: GroupPubkeyType, options: GroupWrapperConstructor) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'init', options]) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['init']>
    >,
  needsPush: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'needsPush']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['needsPush']>
    >,
  push: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'push']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['push']>
    >,
  needsDump: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'needsDump']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['needsDump']>
    >,
  metaDump: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'metaDump']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['metaDump']>
    >,
  metaConfirmPushed: async (
    groupPk: GroupPubkeyType,
    args: Parameters<MetaGroupWrapperActionsCalls['metaConfirmPushed']>[1]
  ) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'metaConfirmPushed', args]) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['metaConfirmPushed']>
    >,

  /** GroupInfo wrapper specific actions */
  infoGet: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'infoGet']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['infoGet']>
    >,
  infoSet: async (groupPk: GroupPubkeyType, infos: GroupInfoSet) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'infoSet', infos]) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['infoSet']>
    >,
  infoDestroy: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'infoDestroy']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['infoDestroy']>
    >,

  /** GroupMembers wrapper specific actions */
  memberGet: async (groupPk: GroupPubkeyType, pubkeyHex: string) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'memberGet', pubkeyHex]) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['memberGet']>
    >,
  memberGetOrConstruct: async (groupPk: GroupPubkeyType, pubkeyHex: string) =>
    callLibSessionWorker([
      `MetaGroupConfig-${groupPk}`,
      'memberGetOrConstruct',
      pubkeyHex,
    ]) as Promise<ReturnType<MetaGroupWrapperActionsCalls['memberGetOrConstruct']>>,
  memberGetAll: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'memberGetAll']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['memberGetAll']>
    >,
  memberErase: async (groupPk: GroupPubkeyType, pubkeyHex: string) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'memberErase', pubkeyHex]) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['memberErase']>
    >,
  memberSetAccepted: async (groupPk: GroupPubkeyType, pubkeyHex: string) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'memberSetAccepted', pubkeyHex]) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['memberSetAccepted']>
    >,
  memberSetPromoted: async (groupPk: GroupPubkeyType, pubkeyHex: string, failed: boolean) =>
    callLibSessionWorker([
      `MetaGroupConfig-${groupPk}`,
      'memberSetPromoted',
      pubkeyHex,
      failed,
    ]) as Promise<ReturnType<MetaGroupWrapperActionsCalls['memberSetPromoted']>>,
  memberSetInvited: async (groupPk: GroupPubkeyType, pubkeyHex: string, failed: boolean) =>
    callLibSessionWorker([
      `MetaGroupConfig-${groupPk}`,
      'memberSetInvited',
      pubkeyHex,
      failed,
    ]) as Promise<ReturnType<MetaGroupWrapperActionsCalls['memberSetInvited']>>,
  memberSetName: async (groupPk: GroupPubkeyType, pubkeyHex: string, name: string) =>
    callLibSessionWorker([
      `MetaGroupConfig-${groupPk}`,
      'memberSetName',
      pubkeyHex,
      name,
    ]) as Promise<ReturnType<MetaGroupWrapperActionsCalls['memberSetName']>>,
  memberSetProfilePicture: async (
    groupPk: GroupPubkeyType,
    pubkeyHex: string,
    profilePicture: ProfilePicture
  ) =>
    callLibSessionWorker([
      `MetaGroupConfig-${groupPk}`,
      'memberSetProfilePicture',
      pubkeyHex,
      profilePicture,
    ]) as Promise<ReturnType<MetaGroupWrapperActionsCalls['memberSetProfilePicture']>>,

  /** GroupKeys wrapper specific actions */

  keyRekey: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'keyRekey']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['keyRekey']>
    >,
  keysNeedsRekey: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'keysNeedsRekey']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['keysNeedsRekey']>
    >,
  groupKeys: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'groupKeys']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['groupKeys']>
    >,
  currentHashes: async (groupPk: GroupPubkeyType) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'currentHashes']) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['currentHashes']>
    >,

  loadKeyMessage: async (
    groupPk: GroupPubkeyType,
    hash: string,
    data: Uint8Array,
    timestampMs: number
  ) =>
    callLibSessionWorker([
      `MetaGroupConfig-${groupPk}`,
      'loadKeyMessage',
      hash,
      data,
      timestampMs,
    ]) as Promise<ReturnType<MetaGroupWrapperActionsCalls['loadKeyMessage']>>,
  encryptMessage: async (groupPk: GroupPubkeyType, plaintext: Uint8Array, compress: boolean) =>
    callLibSessionWorker([
      `MetaGroupConfig-${groupPk}`,
      'encryptMessage',
      plaintext,
      compress,
    ]) as Promise<ReturnType<MetaGroupWrapperActionsCalls['encryptMessage']>>,
  decryptMessage: async (groupPk: GroupPubkeyType, ciphertext: Uint8Array) =>
    callLibSessionWorker([`MetaGroupConfig-${groupPk}`, 'decryptMessage', ciphertext]) as Promise<
      ReturnType<MetaGroupWrapperActionsCalls['decryptMessage']>
    >,
};

export const callLibSessionWorker = async (
  callToMake: LibSessionWorkerFunctions
): Promise<unknown> => {
  return internalCallLibSessionWorker(callToMake);
};
