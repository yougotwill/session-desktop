import { expect } from 'chai';
import { GroupPubkeyType } from 'libsession_util_nodejs';
import { omit, pick } from 'lodash';
import Long from 'long';
import Sinon from 'sinon';
import { ConfigDumpData } from '../../../../../../data/configDump/configDump';
import { getSodiumNode } from '../../../../../../node/sodiumNode';
import { NotEmptyArrayOfBatchResults } from '../../../../../../session/apis/snode_api/SnodeRequestTypes';
import { GetNetworkTime } from '../../../../../../session/apis/snode_api/getNetworkTime';
import { SnodeNamespaces } from '../../../../../../session/apis/snode_api/namespaces';
import { ConvoHub } from '../../../../../../session/conversations';
import { LibSodiumWrappers } from '../../../../../../session/crypto';
import { UserUtils } from '../../../../../../session/utils';
import { RunJobResult } from '../../../../../../session/utils/job_runners/PersistedJob';
import {
  GroupSuccessfulChange,
  GroupSync,
} from '../../../../../../session/utils/job_runners/jobs/GroupConfigJob';
import {
  GroupSingleDestinationChanges,
  LibSessionUtil,
  PendingChangesForGroup,
} from '../../../../../../session/utils/libsession/libsession_utils';
import { MetaGroupWrapperActions } from '../../../../../../webworker/workers/browser/libsession_worker_interface';
import { TestUtils } from '../../../../../test-utils';
import { MessageSender } from '../../../../../../session/sending';
import { TypedStub } from '../../../../../test-utils/utils';
import { TTL_DEFAULT } from '../../../../../../session/constants';

function validInfo(sodium: LibSodiumWrappers) {
  return {
    type: 'GroupInfo',
    data: sodium.randombytes_buf(12),
    seqno: Long.fromNumber(123),
    namespace: SnodeNamespaces.ClosedGroupInfo,
    timestamp: 1234,
  } as const;
}
function validMembers(sodium: LibSodiumWrappers) {
  return {
    type: 'GroupMember',
    data: sodium.randombytes_buf(12),
    seqno: Long.fromNumber(321),
    namespace: SnodeNamespaces.ClosedGroupMembers,
    timestamp: 4321,
  } as const;
}

function validKeys(sodium: LibSodiumWrappers) {
  return {
    type: 'GroupKeys',
    data: sodium.randombytes_buf(12),
    namespace: SnodeNamespaces.ClosedGroupKeys,
    timestamp: 3333,
  } as const;
}

describe('GroupSyncJob saveMetaGroupDumpToDb', () => {
  let groupPk: GroupPubkeyType;

  beforeEach(async () => {});
  beforeEach(() => {
    groupPk = TestUtils.generateFakeClosedGroupV3PkStr();
  });

  afterEach(() => {
    Sinon.restore();
  });

  it('does not save to DB if needsDump reports false', async () => {
    Sinon.stub(MetaGroupWrapperActions, 'needsDump').resolves(false);
    const metaDump = Sinon.stub(MetaGroupWrapperActions, 'metaDump').resolves(new Uint8Array());
    const saveConfigDump = Sinon.stub(ConfigDumpData, 'saveConfigDump').resolves();
    await LibSessionUtil.saveMetaGroupDumpToDb(groupPk);
    expect(saveConfigDump.callCount).to.be.equal(0);
    expect(metaDump.callCount).to.be.equal(0);
  });

  it('does save to DB if needsDump reports true', async () => {
    Sinon.stub(MetaGroupWrapperActions, 'needsDump').resolves(true);
    const dump = [1, 2, 3, 4, 5];
    const metaDump = Sinon.stub(MetaGroupWrapperActions, 'metaDump').resolves(new Uint8Array(dump));
    const saveConfigDump = Sinon.stub(ConfigDumpData, 'saveConfigDump').resolves();
    await LibSessionUtil.saveMetaGroupDumpToDb(groupPk);
    expect(saveConfigDump.callCount).to.be.equal(1);
    expect(metaDump.callCount).to.be.equal(1);
    expect(metaDump.firstCall.args).to.be.deep.eq([groupPk]);
    expect(saveConfigDump.firstCall.args).to.be.deep.eq([
      {
        publicKey: groupPk,
        variant: `MetaGroupConfig-${groupPk}`,
        data: new Uint8Array(dump),
      },
    ]);
  });
});

describe('GroupSyncJob pendingChangesForGroup', () => {
  let groupPk: GroupPubkeyType;
  beforeEach(() => {
    groupPk = TestUtils.generateFakeClosedGroupV3PkStr();
  });

  afterEach(() => {
    Sinon.restore();
  });

  it('empty results if needsPush is false', async () => {
    Sinon.stub(MetaGroupWrapperActions, 'needsPush').resolves(false);
    const result = await LibSessionUtil.pendingChangesForGroup(groupPk);
    expect(result.allOldHashes.size).to.be.equal(0);
    expect(result.messages.length).to.be.equal(0);
  });

  it('valid results if needsPush is true', async () => {
    const pushResults = {
      groupKeys: { data: new Uint8Array([3, 2, 1]), namespace: 13 },
      groupInfo: {
        seqno: 1,
        data: new Uint8Array([1, 2, 3]),
        hashes: ['123', '333'],
        namespace: 12,
      },
      groupMember: {
        seqno: 2,
        data: new Uint8Array([1, 2]),
        hashes: ['321', '111'],
        namespace: 14,
      },
    };
    Sinon.stub(MetaGroupWrapperActions, 'needsPush').resolves(true);
    Sinon.stub(MetaGroupWrapperActions, 'push').resolves(pushResults);
    Sinon.stub(GetNetworkTime, 'getNowWithNetworkOffset').returns(1234);
    const result = await LibSessionUtil.pendingChangesForGroup(groupPk);
    expect(result.allOldHashes.size).to.be.equal(4);
    // check that all of the hashes are there
    expect([...result.allOldHashes]).to.have.members([
      ...pushResults.groupInfo.hashes,
      ...pushResults.groupMember.hashes,
    ]);

    expect(result.messages.length).to.be.equal(3);
    // check for the keys push content
    expect(result.messages[0]).to.be.deep.eq({
      type: 'GroupKeys',
      data: new Uint8Array([3, 2, 1]),
      namespace: 13,
    });
    // check for the info push content
    expect(result.messages[1]).to.be.deep.eq({
      type: 'GroupInfo',
      data: new Uint8Array([1, 2, 3]),
      namespace: 12,
      seqno: Long.fromInt(pushResults.groupInfo.seqno),
    });
    // check for the members pusu content
    expect(result.messages[2]).to.be.deep.eq({
      type: 'GroupMember',
      data: new Uint8Array([1, 2]),
      namespace: 14,
      seqno: Long.fromInt(pushResults.groupMember.seqno),
    });
  });

  it('skips entry results if needsPush one of the wrapper has no changes', async () => {
    const pushResults = {
      groupInfo: {
        seqno: 1,
        data: new Uint8Array([1, 2, 3]),
        hashes: ['123', '333'],
        namespace: 12,
      },
      groupMember: null,
      groupKeys: { data: new Uint8Array([3, 2, 1]), namespace: 13 },
    };
    Sinon.stub(MetaGroupWrapperActions, 'needsPush').resolves(true);
    Sinon.stub(MetaGroupWrapperActions, 'push').resolves(pushResults);
    const result = await LibSessionUtil.pendingChangesForGroup(groupPk);
    expect(result.allOldHashes.size).to.be.equal(2);
    expect(result.messages.length).to.be.equal(2);
  });
});

describe('GroupSyncJob run()', () => {
  afterEach(() => {
    Sinon.restore();
  });
  it('throws if no user keys', async () => {
    const job = new GroupSync.GroupSyncJob({
      identifier: TestUtils.generateFakeClosedGroupV3PkStr(),
    });

    const func = async () => job.run();
    await expect(func()).to.be.eventually.rejected;
  });

  it('permanent failure if group is not a 03 one', async () => {
    const job = new GroupSync.GroupSyncJob({
      identifier: TestUtils.generateFakeClosedGroupV3PkStr().slice(2),
    });
    const result = await job.run();
    expect(result).to.be.eq(RunJobResult.PermanentFailure);
  });

  it('permanent failure if user has no ed keypair', async () => {
    Sinon.stub(UserUtils, 'getOurPubKeyStrFromCache').returns(TestUtils.generateFakePubKeyStr());
    Sinon.stub(UserUtils, 'getUserED25519KeyPairBytes').resolves(undefined);
    Sinon.stub(ConvoHub.use(), 'get').resolves({}); // anything not falsy
    const job = new GroupSync.GroupSyncJob({
      identifier: TestUtils.generateFakeClosedGroupV3PkStr(),
    });
    const result = await job.run();
    expect(result).to.be.eq(RunJobResult.PermanentFailure);
  });

  it('permanent failure if user has no own conversation', async () => {
    Sinon.stub(UserUtils, 'getOurPubKeyStrFromCache').returns(TestUtils.generateFakePubKeyStr());
    Sinon.stub(UserUtils, 'getUserED25519KeyPairBytes').resolves({} as any); // anything not falsy
    Sinon.stub(ConvoHub.use(), 'get').returns(undefined as any);
    const job = new GroupSync.GroupSyncJob({
      identifier: TestUtils.generateFakeClosedGroupV3PkStr(),
    });
    const result = await job.run();
    expect(result).to.be.eq(RunJobResult.PermanentFailure);
  });

  it('calls pushChangesToGroupSwarmIfNeeded if preconditions are fine', async () => {
    Sinon.stub(UserUtils, 'getOurPubKeyStrFromCache').returns(TestUtils.generateFakePubKeyStr());
    Sinon.stub(UserUtils, 'getUserED25519KeyPairBytes').resolves({} as any); // anything not falsy
    const taskedRun = Sinon.stub(GroupSync, 'pushChangesToGroupSwarmIfNeeded').resolves(
      RunJobResult.Success
    );
    Sinon.stub(ConvoHub.use(), 'get').returns({} as any); // anything not falsy
    const job = new GroupSync.GroupSyncJob({
      identifier: TestUtils.generateFakeClosedGroupV3PkStr(),
    });
    const result = await job.run();
    expect(result).to.be.eq(RunJobResult.Success);
    expect(taskedRun.callCount).to.be.eq(1);
  });
});

describe('GroupSyncJob resultsToSuccessfulChange', () => {
  let sodium: LibSodiumWrappers;
  beforeEach(async () => {
    sodium = await getSodiumNode();
  });
  it('no or empty results return empty array', () => {
    expect(
      GroupSync.resultsToSuccessfulChange(null, { allOldHashes: new Set(), messages: [] })
    ).to.be.deep.eq([]);

    expect(
      GroupSync.resultsToSuccessfulChange([] as any as NotEmptyArrayOfBatchResults, {
        allOldHashes: new Set(),
        messages: [],
      })
    ).to.be.deep.eq([]);
  });

  it('extract one result with 200 and messagehash', () => {
    const member = validMembers(sodium);
    const info = validInfo(sodium);
    const batchResults: NotEmptyArrayOfBatchResults = [{ code: 200, body: { hash: 'hash1' } }];
    const request: GroupSingleDestinationChanges = {
      allOldHashes: new Set(),
      messages: [info, member],
    };
    const results = GroupSync.resultsToSuccessfulChange(batchResults, request);
    expect(results).to.be.deep.eq([
      {
        updatedHash: 'hash1',
        pushed: info,
      },
    ]);
  });

  it('extract two results with 200 and messagehash', () => {
    const member = validMembers(sodium);
    const info = validInfo(sodium);
    const batchResults: NotEmptyArrayOfBatchResults = [
      { code: 200, body: { hash: 'hash1' } },
      { code: 200, body: { hash: 'hash2' } },
    ];
    const request: GroupSingleDestinationChanges = {
      allOldHashes: new Set(),
      messages: [info, member],
    };
    const results = GroupSync.resultsToSuccessfulChange(batchResults, request);
    expect(results).to.be.deep.eq([
      {
        updatedHash: 'hash1',
        pushed: info,
      },
      {
        updatedHash: 'hash2',
        pushed: member,
      },
    ]);
  });

  it('skip message hashes not a string', () => {
    const member = validMembers(sodium);
    const info = validInfo(sodium);
    const batchResults: NotEmptyArrayOfBatchResults = [
      { code: 200, body: { hash: 123 as any as string } },
      { code: 200, body: { hash: 'hash2' } },
    ];
    const request: GroupSingleDestinationChanges = {
      allOldHashes: new Set(),
      messages: [info, member],
    };
    const results = GroupSync.resultsToSuccessfulChange(batchResults, request);
    expect(results).to.be.deep.eq([
      {
        updatedHash: 'hash2',
        pushed: member,
      },
    ]);
  });

  it('skip request item without data', () => {
    const member = validMembers(sodium);
    const info = validInfo(sodium);
    const infoNoData = omit(info, 'data');
    const batchResults: NotEmptyArrayOfBatchResults = [
      { code: 200, body: { hash: 'hash1' } },
      { code: 200, body: { hash: 'hash2' } },
    ];
    const request: GroupSingleDestinationChanges = {
      allOldHashes: new Set(),
      messages: [infoNoData as any as PendingChangesForGroup, member],
    };
    const results = GroupSync.resultsToSuccessfulChange(batchResults, request);
    expect(results).to.be.deep.eq([
      {
        updatedHash: 'hash2',
        pushed: member,
      },
    ]);
  });

  it('skip request item without 200 code', () => {
    const member = validMembers(sodium);
    const info = validInfo(sodium);
    const batchResults: NotEmptyArrayOfBatchResults = [
      { code: 200, body: { hash: 'hash1' } },
      { code: 401, body: { hash: 'hash2' } },
    ];
    const request: GroupSingleDestinationChanges = {
      allOldHashes: new Set(),
      messages: [info, member],
    };
    const results = GroupSync.resultsToSuccessfulChange(batchResults, request);
    expect(results).to.be.deep.eq([
      {
        updatedHash: 'hash1',
        pushed: info,
      },
    ]);

    // another test swapping the results
    batchResults[0].code = 401;
    batchResults[1].code = 200;
    const results2 = GroupSync.resultsToSuccessfulChange(batchResults, request);
    expect(results2).to.be.deep.eq([
      {
        updatedHash: 'hash2',
        pushed: member,
      },
    ]);
  });
});

describe('GroupSyncJob pushChangesToGroupSwarmIfNeeded', () => {
  let groupPk: GroupPubkeyType;
  let userkeys: TestUtils.TestUserKeyPairs;
  let sodium: LibSodiumWrappers;

  let sendStub: TypedStub<typeof MessageSender, 'sendEncryptedDataToSnode'>;
  let pendingChangesForGroupStub: TypedStub<typeof LibSessionUtil, 'pendingChangesForGroup'>;
  let saveMetaGroupDumpToDbStub: TypedStub<typeof LibSessionUtil, 'saveMetaGroupDumpToDb'>;

  beforeEach(async () => {
    sodium = await getSodiumNode();
    groupPk = TestUtils.generateFakeClosedGroupV3PkStr();
    userkeys = await TestUtils.generateUserKeyPairs();
    Sinon.stub(UserUtils, 'getOurPubKeyStrFromCache').returns(userkeys.x25519KeyPair.pubkeyHex);
    Sinon.stub(UserUtils, 'getUserED25519KeyPairBytes').resolves(userkeys.ed25519KeyPair);

    pendingChangesForGroupStub = Sinon.stub(LibSessionUtil, 'pendingChangesForGroup');
    saveMetaGroupDumpToDbStub = Sinon.stub(LibSessionUtil, 'saveMetaGroupDumpToDb');
    sendStub = Sinon.stub(MessageSender, 'sendEncryptedDataToSnode');
  });
  afterEach(() => {
    Sinon.restore();
  });

  it('call savesDumpToDb even if no changes are required on the serverside', async () => {
    const result = await GroupSync.pushChangesToGroupSwarmIfNeeded(groupPk);
    pendingChangesForGroupStub.resolves(undefined);
    expect(result).to.be.eq(RunJobResult.Success);
    expect(sendStub.callCount).to.be.eq(0);
    expect(pendingChangesForGroupStub.callCount).to.be.eq(1);
    expect(saveMetaGroupDumpToDbStub.callCount).to.be.eq(1);
    expect(saveMetaGroupDumpToDbStub.firstCall.args).to.be.deep.eq([groupPk]);
  });

  it('calls sendEncryptedDataToSnode with the right data and retry if network returned nothing', async () => {
    const info = validInfo(sodium);
    const member = validMembers(sodium);
    const networkTimestamp = 4444;
    const ttl = TTL_DEFAULT.TTL_CONFIG;
    Sinon.stub(GetNetworkTime, 'getNowWithNetworkOffset').returns(networkTimestamp);
    pendingChangesForGroupStub.resolves({
      messages: [info, member],
      allOldHashes: new Set('123'),
    });
    const result = await GroupSync.pushChangesToGroupSwarmIfNeeded(groupPk);

    sendStub.resolves(undefined);
    expect(result).to.be.eq(RunJobResult.RetryJobIfPossible); // not returning anything in the sendstub so network issue happened
    expect(sendStub.callCount).to.be.eq(1);
    expect(pendingChangesForGroupStub.callCount).to.be.eq(1);
    expect(saveMetaGroupDumpToDbStub.callCount).to.be.eq(1);
    expect(saveMetaGroupDumpToDbStub.firstCall.args).to.be.deep.eq([groupPk]);

    function expected(details: any) {
      return { ...pick(details, 'data', 'namespace'), ttl, networkTimestamp, pubkey: groupPk };
    }

    const expectedInfo = expected(info);
    const expectedMember = expected(member);
    expect(sendStub.firstCall.args).to.be.deep.eq([
      [expectedInfo, expectedMember],
      groupPk,
      new Set('123'),
    ]);
  });

  it('calls sendEncryptedDataToSnode with the right data and retry if network returned nothing', async () => {
    const info = validInfo(sodium);
    const member = validMembers(sodium);
    const keys = validKeys(sodium);
    pendingChangesForGroupStub.resolves({
      messages: [keys, info, member],
      allOldHashes: new Set('123'),
    });
    const changes: Array<GroupSuccessfulChange> = [
      {
        pushed: keys,
        updatedHash: 'hashkeys',
      },
      {
        pushed: info,
        updatedHash: 'hash1',
      },
      {
        pushed: member,
        updatedHash: 'hash2',
      },
    ];
    Sinon.stub(GroupSync, 'resultsToSuccessfulChange').returns(changes);
    const metaConfirmPushed = Sinon.stub(MetaGroupWrapperActions, 'metaConfirmPushed').resolves();

    sendStub.resolves([
      { code: 200, body: { hash: 'hashkeys' } },
      { code: 200, body: { hash: 'hash1' } },
      { code: 200, body: { hash: 'hash2' } },
      { code: 200, body: {} }, // because we are giving a set of allOldHashes
    ]);
    const result = await GroupSync.pushChangesToGroupSwarmIfNeeded(groupPk);

    expect(sendStub.callCount).to.be.eq(1);
    expect(pendingChangesForGroupStub.callCount).to.be.eq(1);
    expect(saveMetaGroupDumpToDbStub.callCount).to.be.eq(2);
    expect(saveMetaGroupDumpToDbStub.firstCall.args).to.be.deep.eq([groupPk]);
    expect(saveMetaGroupDumpToDbStub.secondCall.args).to.be.deep.eq([groupPk]);
    expect(metaConfirmPushed.callCount).to.be.eq(1);
    expect(metaConfirmPushed.firstCall.args).to.be.deep.eq([
      groupPk,
      {
        groupInfo: [123, 'hash1'],
        groupMember: [321, 'hash2'],
      },
    ]);
    expect(result).to.be.eq(RunJobResult.Success);
  });
});
