/* eslint-disable no-await-in-loop */
import { GroupPubkeyType } from 'libsession_util_nodejs';
import { compact, isArray, isEmpty, isNumber, isString } from 'lodash';
import { UserUtils } from '../..';
import { ConfigDumpData } from '../../../../data/configDump/configDump';
import { ReleasedFeatures } from '../../../../util/releaseFeature';
import { isSignInByLinking } from '../../../../util/storage';
import { isMetaWrapperType } from '../../../../webworker/workers/browser/libsession_worker_functions';
import { NotEmptyArrayOfBatchResults } from '../../../apis/snode_api/SnodeRequestTypes';
import { getConversationController } from '../../../conversations';
import { SharedGroupConfigMessage } from '../../../messages/outgoing/controlMessage/SharedConfigMessage';
import { MessageSender } from '../../../sending/MessageSender';
import { PubKey } from '../../../types';
import { allowOnlyOneAtATime } from '../../Promise';
import { LibSessionUtil, OutgoingConfResult } from '../../libsession/libsession_utils';
import { runners } from '../JobRunner';
import {
  AddJobCheckReturn,
  GroupSyncPersistedData,
  PersistedJob,
  RunJobResult,
} from '../PersistedJob';
import { MetaGroupWrapperActions } from '../../../../webworker/workers/browser/libsession_worker_interface';
import { SignalService } from '../../../../protobuf';
import { GroupConfigKind } from '../../../../types/ProtobufKind';

const defaultMsBetweenRetries = 15000; // a long time between retries, to avoid running multiple jobs at the same time, when one was postponed at the same time as one already planned (5s)
const defaultMaxAttempts = 2;

/**
 * We want to run each of those jobs at least 3seconds apart.
 * So every time one of that job finishes, update this timestamp, so we know when adding a new job, what is the next minimun date to run it.
 */
let lastRunConfigSyncJobTimestamp: number | null = null;

export type SingleDestinationChanges = {
  messages: Array<OutgoingConfResult<GroupConfigKind, SharedGroupConfigMessage>>;
  allOldHashes: Array<string>;
};

type SuccessfulChange = {
  message: SharedGroupConfigMessage;
  updatedHash: string;
};

/**
 * Later in the syncing logic, we want to batch-send all the updates for a pubkey in a single batch call.
 * To make this easier, this function prebuilds and merges together all the changes for each pubkey.
 */
async function retrieveSingleDestinationChanges(
  groupPk: GroupPubkeyType
): Promise<SingleDestinationChanges> {
  const outgoingConfResults = await LibSessionUtil.pendingChangesForGroup(groupPk);

  const compactedHashes = compact(outgoingConfResults.map(m => m.oldMessageHashes)).flat();

  return { messages: outgoingConfResults, allOldHashes: compactedHashes };
}

/**
 * This function is run once we get the results from the multiple batch-send.
 */
function resultsToSuccessfulChange(
  result: NotEmptyArrayOfBatchResults | null,
  request: SingleDestinationChanges
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

    if (
      batchResult.code === 200 &&
      isString(messagePostedHashes) &&
      request.messages?.[j].message
    ) {
      // the library keeps track of the hashes to push and pushed using the hashes now
      successfulChanges.push({
        updatedHash: messagePostedHashes,
        message: request.messages?.[j].message,
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
    { groupInfo: null, groupKeys: null, groupMember: null },
  ];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const variant = LibSessionUtil.groupKindToVariant(change.message.kind, groupPk);

    if (!isMetaWrapperType(variant)) {
      throw new Error(`buildAndSaveDumpsToDB non metagroup variant: ${variant}`);
    }
    const Kind = SignalService.SharedConfigMessage.Kind;
    switch (change.message.kind) {
      case Kind.GROUP_INFO: {
        toConfirm[1].groupInfo = [change.message.seqno.toNumber(), change.updatedHash];
        break;
      }
      case Kind.GROUP_MEMBERS: {
        toConfirm[1].groupMember = [change.message.seqno.toNumber(), change.updatedHash];
        break;
      }
      case Kind.GROUP_KEYS: {
        toConfirm[1].groupKeys = [change.message.seqno.toNumber(), change.updatedHash];
        break;
      }
    }
  }
  await MetaGroupWrapperActions.metaConfirmPushed(...toConfirm);
  const metaNeedsDump = await MetaGroupWrapperActions.needsDump(groupPk);
  // save the concatenated dumps as a single entry in the DB if any of the dumps had a need for dump
  if (metaNeedsDump) {
    const dump = await MetaGroupWrapperActions.metaDump(groupPk);
    await ConfigDumpData.saveConfigDump({
      data: dump,
      publicKey: groupPk,
      variant: `MetaGroupConfig-${groupPk}`,
    });
  }
}

async function saveDumpsNeededToDB(groupPk: GroupPubkeyType) {
  const needsDump = await MetaGroupWrapperActions.needsDump(groupPk);

  if (!needsDump) {
    return;
  }
  const dump = await MetaGroupWrapperActions.metaDump(groupPk);
  await ConfigDumpData.saveConfigDump({
    data: dump,
    publicKey: groupPk,
    variant: `MetaGroupConfig-${groupPk}`,
  });
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

      if (!PubKey.isClosedGroupV3(thisJobDestination)) {
        return RunJobResult.PermanentFailure;
      }

      // save the dumps to DB even before trying to push them, so at least we have an up to date dumps in the DB in case of crash, no network etc
      await saveDumpsNeededToDB(thisJobDestination);
      const newGroupsReleased = await ReleasedFeatures.checkIsNewGroupsReleased();

      // if the feature flag is not enabled, we want to keep updating the dumps, but just not sync them.
      if (!newGroupsReleased) {
        return RunJobResult.Success;
      }
      const singleDestChanges = await retrieveSingleDestinationChanges(thisJobDestination);

      // If there are no pending changes then the job can just complete (next time something
      // is updated we want to try and run immediately so don't scuedule another run in this case)
      if (isEmpty(singleDestChanges?.messages)) {
        return RunJobResult.Success;
      }
      const oldHashesToDelete = new Set(singleDestChanges.allOldHashes);
      const msgs = singleDestChanges.messages.map(item => {
        return {
          namespace: item.namespace,
          pubkey: thisJobDestination,
          timestamp: item.message.timestamp,
          ttl: item.message.ttl(),
          message: item.message,
        };
      });

      const result = await MessageSender.sendMessagesToSnode(
        msgs,
        thisJobDestination,
        oldHashesToDelete
      );

      const expectedReplyLength =
        singleDestChanges.messages.length + (oldHashesToDelete.size ? 1 : 0);
      // we do a sequence call here. If we do not have the right expected number of results, consider it a failure
      if (!isArray(result) || result.length !== expectedReplyLength) {
        window.log.info(
          `ConfigurationSyncJob: unexpected result length: expected ${expectedReplyLength} but got ${result?.length}`
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

      await buildAndSaveDumpsToDB(changes, thisJobDestination);
      return RunJobResult.Success;
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
    lastRunConfigSyncJobTimestamp = Date.now();
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
  } else {
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
}

export const GroupSync = {
  GroupSyncJob,
  queueNewJobIfNeeded: (groupPk: GroupPubkeyType) =>
    allowOnlyOneAtATime('GroupSyncJob-oneAtAtTime' + groupPk, () => queueNewJobIfNeeded(groupPk)),
};
