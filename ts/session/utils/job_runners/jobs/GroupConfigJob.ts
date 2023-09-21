/* eslint-disable no-await-in-loop */
import { GroupPubkeyType } from 'libsession_util_nodejs';
import { isArray, isEmpty, isNumber, isString } from 'lodash';
import { UserUtils } from '../..';
import { isSignInByLinking } from '../../../../util/storage';
import { MetaGroupWrapperActions } from '../../../../webworker/workers/browser/libsession_worker_interface';
import {
  NotEmptyArrayOfBatchResults,
  StoreOnNodeData,
} from '../../../apis/snode_api/SnodeRequestTypes';
import { GetNetworkTime } from '../../../apis/snode_api/getNetworkTime';
import { SnodeNamespaces } from '../../../apis/snode_api/namespaces';
import { TTL_DEFAULT } from '../../../constants';
import { getConversationController } from '../../../conversations';
import { MessageSender } from '../../../sending/MessageSender';
import { PubKey } from '../../../types';
import { allowOnlyOneAtATime } from '../../Promise';
import {
  GroupSingleDestinationChanges,
  LibSessionUtil,
  PendingChangesForGroup,
} from '../../libsession/libsession_utils';
import { runners } from '../JobRunner';
import {
  AddJobCheckReturn,
  GroupSyncPersistedData,
  PersistedJob,
  RunJobResult,
} from '../PersistedJob';
import { assertUnreachable } from '../../../../types/sqlSharedTypes';

const defaultMsBetweenRetries = 15000; // a long time between retries, to avoid running multiple jobs at the same time, when one was postponed at the same time as one already planned (5s)
const defaultMaxAttempts = 2;

/**
 * We want to run each of those jobs at least 3seconds apart.
 * So every time one of that job finishes, update this timestamp, so we know when adding a new job, what is the next minimun date to run it.
 */
const lastRunConfigSyncJobTimestamps = new Map<string, number | null>();

type SuccessfulChange = {
  pushed: PendingChangesForGroup;
  updatedHash: string;
};

/**
 * This function is run once we get the results from the multiple batch-send.
 */
function resultsToSuccessfulChange(
  result: NotEmptyArrayOfBatchResults | null,
  request: GroupSingleDestinationChanges
): Array<SuccessfulChange> {
  const successfulChanges: Array<SuccessfulChange> = [];

  /**
   * For each batch request, we get as result
   * - status code + hash of the new config message
   * - status code of the delete of all messages as given by the request hashes.
   *
   * As it is a sequence, the delete might have failed but the new config message might still be posted.
   * So we need to check which request failed, and if it is the delete by hashes, we need to add the hash of the posted message to the list of hashes
   */

  if (!result?.length) {
    return successfulChanges;
  }

  for (let j = 0; j < result.length; j++) {
    const batchResult = result[j];
    const messagePostedHashes = batchResult?.body?.hash;

    if (batchResult.code === 200 && isString(messagePostedHashes) && request.messages?.[j].data) {
      // libsession keeps track of the hashes to push and pushed using the hashes now
      successfulChanges.push({
        updatedHash: messagePostedHashes,
        pushed: request.messages?.[j],
      });
    }
  }

  return successfulChanges;
}

async function buildAndSaveDumpsToDB(
  changes: Array<SuccessfulChange>,
  groupPk: GroupPubkeyType
): Promise<void> {
  const toConfirm: Parameters<typeof MetaGroupWrapperActions.metaConfirmPushed> = [
    groupPk,
    { groupInfo: null, groupMember: null },
  ];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const namespace = change.pushed.namespace;
    switch (namespace) {
      case SnodeNamespaces.ClosedGroupInfo: {
        if ((change.pushed as any).seqno) {
          toConfirm[1].groupInfo = [change.pushed.seqno.toNumber(), change.updatedHash];
        }
        break;
      }
      case SnodeNamespaces.ClosedGroupMembers: {
        toConfirm[1].groupMember = [change.pushed.seqno.toNumber(), change.updatedHash];
        break;
      }
      case SnodeNamespaces.ClosedGroupKeys: {
        break;
      }
      default:
        assertUnreachable(namespace, 'buildAndSaveDumpsToDB assertUnreachable');
    }
  }

  await MetaGroupWrapperActions.metaConfirmPushed(...toConfirm);
  return LibSessionUtil.saveMetaGroupDumpToDb(groupPk);
}

async function pushChangesToGroupSwarmIfNeeded(groupPk: GroupPubkeyType): Promise<RunJobResult> {
  // save the dumps to DB even before trying to push them, so at least we have an up to date dumps in the DB in case of crash, no network etc
  await LibSessionUtil.saveMetaGroupDumpToDb(groupPk);

  const singleDestChanges = await LibSessionUtil.pendingChangesForGroup(groupPk);

  // If there are no pending changes then the job can just complete (next time something
  // is updated we want to try and run immediately so don't scuedule another run in this case)
  if (isEmpty(singleDestChanges?.messages)) {
    return RunJobResult.Success;
  }
  const oldHashesToDelete = new Set(singleDestChanges.allOldHashes);

  const msgs: Array<StoreOnNodeData> = singleDestChanges.messages.map(item => {
    return {
      namespace: item.namespace,
      pubkey: groupPk,
      networkTimestamp: GetNetworkTime.getNowWithNetworkOffset(),
      ttl: TTL_DEFAULT.TTL_CONFIG,
      data: item.data,
    };
  });

  const result = await MessageSender.sendEncryptedDataToSnode(msgs, groupPk, oldHashesToDelete);

  const expectedReplyLength = singleDestChanges.messages.length + (oldHashesToDelete.size ? 1 : 0);
  // we do a sequence call here. If we do not have the right expected number of results, consider it a failure
  if (!isArray(result) || result.length !== expectedReplyLength) {
    window.log.info(
      `GroupSyncJob: unexpected result length: expected ${expectedReplyLength} but got ${result?.length}`
    );
    // this might be a 421 error (already handled) so let's retry this request a little bit later
    return RunJobResult.RetryJobIfPossible;
  }

  const changes = resultsToSuccessfulChange(result, singleDestChanges);
  if (isEmpty(changes)) {
    return RunJobResult.RetryJobIfPossible;
  }
  // Now that we have the successful changes, we need to mark them as pushed and
  // generate any config dumps which need to be stored

  await buildAndSaveDumpsToDB(changes, groupPk);
  return RunJobResult.Success;
}

class GroupSyncJob extends PersistedJob<GroupSyncPersistedData> {
  constructor({
    identifier, // this has to be the pubkey to which we
    nextAttemptTimestamp,
    maxAttempts,
    currentRetry,
  }: Pick<GroupSyncPersistedData, 'identifier'> &
    Partial<
      Pick<GroupSyncPersistedData, 'nextAttemptTimestamp' | 'currentRetry' | 'maxAttempts'>
    >) {
    super({
      jobType: 'GroupSyncJobType',
      identifier,
      delayBetweenRetries: defaultMsBetweenRetries,
      maxAttempts: isNumber(maxAttempts) ? maxAttempts : defaultMaxAttempts,
      currentRetry: isNumber(currentRetry) ? currentRetry : 0,
      nextAttemptTimestamp: nextAttemptTimestamp || Date.now(),
    });
  }

  public async run(): Promise<RunJobResult> {
    const start = Date.now();

    try {
      const thisJobDestination = this.persistedData.identifier;

      window.log.debug(`GroupSyncJob starting ${thisJobDestination}`);

      const us = UserUtils.getOurPubKeyStrFromCache();
      const ed25519Key = await UserUtils.getUserED25519KeyPairBytes();
      const conversation = getConversationController().get(us);
      if (!us || !conversation || !ed25519Key) {
        // we check for ed25519Key because it is needed for authenticated requests
        window.log.warn('did not find our own conversation');
        return RunJobResult.PermanentFailure;
      }

      if (!PubKey.isClosedGroupV2(thisJobDestination)) {
        return RunJobResult.PermanentFailure;
      }

      return await pushChangesToGroupSwarmIfNeeded(thisJobDestination);

      // eslint-disable-next-line no-useless-catch
    } catch (e) {
      throw e;
    } finally {
      window.log.debug(`ConfigurationSyncJob run() took ${Date.now() - start}ms`);

      // this is a simple way to make sure whatever happens here, we update the lastest timestamp.
      // (a finally statement is always executed (no matter if exception or returns in other try/catch block)
      this.updateLastTickTimestamp();
    }
  }

  public serializeJob(): GroupSyncPersistedData {
    const fromParent = super.serializeBase();
    return fromParent;
  }

  public addJobCheck(jobs: Array<GroupSyncPersistedData>): AddJobCheckReturn {
    return this.addJobCheckSameTypeAndIdentifierPresent(jobs);
  }

  public nonRunningJobsToRemove(_jobs: Array<GroupSyncPersistedData>) {
    return [];
  }

  public getJobTimeoutMs(): number {
    return 20000;
  }

  private updateLastTickTimestamp() {
    lastRunConfigSyncJobTimestamps.set(this.persistedData.identifier, Date.now());
  }
}

/**
 * Queue a new Sync Configuration if needed job.
 * A GroupSyncJob can only be added if there is none of the same type queued already.
 */
async function queueNewJobIfNeeded(groupPk: GroupPubkeyType) {
  if (isSignInByLinking()) {
    window.log.info(`NOT Scheduling GroupSyncJob for ${groupPk} as we are linking a device`);

    return;
  }
  const lastRunConfigSyncJobTimestamp = lastRunConfigSyncJobTimestamps.get(groupPk);
  if (
    !lastRunConfigSyncJobTimestamp ||
    lastRunConfigSyncJobTimestamp < Date.now() - defaultMsBetweenRetries
  ) {
    // window.log.debug('Scheduling GroupSyncJob: ASAP');
    // we postpone by 1000ms to make sure whoever is adding this job is done with what is needs to do first
    // this call will make sure that there is only one configuration sync job at all times
    await runners.groupSyncRunner.addJob(
      new GroupSyncJob({ identifier: groupPk, nextAttemptTimestamp: Date.now() + 1000 })
    );
    return;
  }

  // if we did run at t=100, and it is currently t=110, the difference is 10
  const diff = Math.max(Date.now() - lastRunConfigSyncJobTimestamp, 0);
  // but we want to run every 30, so what we need is actually `30-10` from now = 20
  const leftBeforeNextTick = Math.max(defaultMsBetweenRetries - diff, 1000);
  // window.log.debug('Scheduling GroupSyncJob: LATER');

  await runners.groupSyncRunner.addJob(
    new GroupSyncJob({
      identifier: groupPk,
      nextAttemptTimestamp: Date.now() + leftBeforeNextTick,
    })
  );
}

export const GroupSync = {
  GroupSyncJob,
  pushChangesToGroupSwarmIfNeeded,
  queueNewJobIfNeeded: (groupPk: GroupPubkeyType) =>
    allowOnlyOneAtATime(`GroupSyncJob-oneAtAtTime-${groupPk}`, () => queueNewJobIfNeeded(groupPk)),
};
