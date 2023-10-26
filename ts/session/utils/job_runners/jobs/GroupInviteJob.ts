import { GroupPubkeyType, PubkeyType } from 'libsession_util_nodejs';
import { isNumber } from 'lodash';
import { v4 } from 'uuid';
import { UserUtils } from '../..';
import { UserGroupsWrapperActions } from '../../../../webworker/workers/browser/libsession_worker_interface';
import { SnodeNamespaces } from '../../../apis/snode_api/namespaces';
import { SnodeGroupSignature } from '../../../apis/snode_api/signature/groupSignature';
import { getMessageQueue } from '../../../sending';
import { PubKey } from '../../../types';
import { runners } from '../JobRunner';
import {
  AddJobCheckReturn,
  GroupInvitePersistedData,
  PersistedJob,
  RunJobResult,
} from '../PersistedJob';

const defaultMsBetweenRetries = 10000;
const defaultMaxAttemps = 1;

type JobExtraArgs = {
  groupPk: GroupPubkeyType;
  member: PubkeyType;
};

export function shouldAddGroupInviteJob(args: JobExtraArgs) {
  if (UserUtils.isUsFromCache(args.member)) {
    return false;
  }

  return true;
}

async function addGroupInviteJob({ groupPk, member }: JobExtraArgs) {
  if (shouldAddGroupInviteJob({ groupPk, member })) {
    const groupInviteJob = new GroupInviteJob({
      groupPk,
      member,
      nextAttemptTimestamp: Date.now(),
    });
    window.log.debug(`addGroupInviteJob: adding group invite for ${groupPk}:${member} `);
    await runners.groupInviteJobRunner.addJob(groupInviteJob);
  }
}

class GroupInviteJob extends PersistedJob<GroupInvitePersistedData> {
  constructor({
    groupPk,
    member,
    nextAttemptTimestamp,
    maxAttempts,
    currentRetry,
    identifier,
  }: Pick<GroupInvitePersistedData, 'groupPk' | 'member'> &
    Partial<
      Pick<
        GroupInvitePersistedData,
        | 'nextAttemptTimestamp'
        | 'identifier'
        | 'maxAttempts'
        | 'delayBetweenRetries'
        | 'currentRetry'
      >
    >) {
    super({
      jobType: 'GroupInviteJobType',
      identifier: identifier || v4(),
      member,
      groupPk,
      delayBetweenRetries: defaultMsBetweenRetries,
      maxAttempts: isNumber(maxAttempts) ? maxAttempts : defaultMaxAttemps,
      nextAttemptTimestamp: nextAttemptTimestamp || Date.now() + defaultMsBetweenRetries,
      currentRetry: isNumber(currentRetry) ? currentRetry : 0,
    });
  }

  public async run(): Promise<RunJobResult> {
    const { groupPk, member } = this.persistedData;

    window.log.info(
      `running job ${this.persistedData.jobType} with groupPk:"${groupPk}" member: ${member} id:"${this.persistedData.identifier}" `
    );
    const group = await UserGroupsWrapperActions.getGroup(this.persistedData.groupPk);
    if (!group || !group.secretKey || !group.name) {
      window.log.warn(`GroupInviteJob: Did not find group in wrapper or no valid info in wrapper`);
      return RunJobResult.PermanentFailure;
    }

    if (UserUtils.isUsFromCache(member)) {
      return RunJobResult.Success; // nothing to do for us, we get the update from our user's libsession wrappers
    }

    const inviteDetails = await SnodeGroupSignature.getGroupInviteMessage({
      groupName: group.name,
      member,
      secretKey: group.secretKey,
      groupPk,
    });
    if (!inviteDetails) {
      window.log.warn(`GroupInviteJob: Did not find group in wrapper or no valid info in wrapper`);

      return RunJobResult.PermanentFailure;
    }

    await getMessageQueue().sendToPubKeyNonDurably({
      message: inviteDetails,
      namespace: SnodeNamespaces.Default,
      pubkey: PubKey.cast(member),
    });

    // return true so this job is marked as a success and we don't need to retry it
    return RunJobResult.Success;
  }

  public serializeJob(): GroupInvitePersistedData {
    return super.serializeBase();
  }

  public nonRunningJobsToRemove(_jobs: Array<GroupInvitePersistedData>) {
    return [];
  }

  public addJobCheck(jobs: Array<GroupInvitePersistedData>): AddJobCheckReturn {
    // avoid adding the same job if the exact same one is already planned
    const hasSameJob = jobs.some(j => {
      return j.groupPk === this.persistedData.groupPk && j.member === this.persistedData.member;
    });

    if (hasSameJob) {
      return 'skipAddSameJobPresent';
    }

    return null;
  }

  public getJobTimeoutMs(): number {
    return 15000;
  }
}

export const GroupInvite = {
  GroupInviteJob,
  addGroupInviteJob,
};
