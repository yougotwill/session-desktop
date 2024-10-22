/* eslint-disable no-await-in-loop */
import { PubkeyType, WithGroupPubkey } from 'libsession_util_nodejs';
import { compact, isEmpty, isNumber } from 'lodash';
import { v4 } from 'uuid';
import { StringUtils } from '../..';
import { Data } from '../../../../data/data';
import { deleteMessagesFromSwarmOnly } from '../../../../interactions/conversations/unsendingInteractions';
import { messageHashesExpired } from '../../../../state/ducks/conversations';
import {
  MetaGroupWrapperActions,
  MultiEncryptWrapperActions,
  UserGroupsWrapperActions,
} from '../../../../webworker/workers/browser/libsession_worker_interface';
import {
  StoreGroupMessageSubRequest,
  StoreGroupRevokedRetrievableSubRequest,
} from '../../../apis/snode_api/SnodeRequestTypes';
import { StoreGroupRequestFactory } from '../../../apis/snode_api/factories/StoreGroupRequestFactory';
import { GetNetworkTime } from '../../../apis/snode_api/getNetworkTime';
import { RevokeChanges, SnodeAPIRevoke } from '../../../apis/snode_api/revokeSubaccount';
import { WithSecretKey } from '../../../apis/snode_api/types';
import { concatUInt8Array, getSodiumRenderer } from '../../../crypto';
import { GroupUpdateDeleteMemberContentMessage } from '../../../messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateDeleteMemberContentMessage';
import { MessageSender } from '../../../sending';
import { fromHexToArray } from '../../String';
import { runners } from '../JobRunner';
import {
  AddJobCheckReturn,
  GroupPendingRemovalsPersistedData,
  PersistedJob,
  RunJobResult,
} from '../PersistedJob';
import { GroupSync } from './GroupSyncJob';

export type WithAddWithoutHistoryMembers = { withoutHistory: Array<PubkeyType> };
export type WithAddWithHistoryMembers = { withHistory: Array<PubkeyType> };
export type WithRemoveMembers = { removed: Array<PubkeyType> };

const defaultMsBetweenRetries = 10000;
const defaultMaxAttempts = 1;

type JobExtraArgs = Pick<GroupPendingRemovalsPersistedData, 'groupPk'>;

async function addJob({ groupPk }: JobExtraArgs) {
  const pendingRemovalJob = new GroupPendingRemovalsJob({
    groupPk,
    nextAttemptTimestamp: Date.now() + 1000, // postpone by 1s
  });
  window.log.debug(`addGroupPendingRemovalJob: adding group pending removal for ${groupPk} `);
  await runners.groupPendingRemovalJobRunner.addJob(pendingRemovalJob);
}

async function getPendingRevokeParams({
  withoutHistory,
  withHistory,
  removed,
  groupPk,
  secretKey,
}: WithGroupPubkey &
  WithSecretKey &
  WithAddWithoutHistoryMembers &
  WithAddWithHistoryMembers &
  WithRemoveMembers) {
  const revokeChanges: RevokeChanges = [];
  const unrevokeChanges: RevokeChanges = [];

  for (let index = 0; index < withoutHistory.length; index++) {
    const m = withoutHistory[index];
    const token = await MetaGroupWrapperActions.swarmSubAccountToken(groupPk, m);
    unrevokeChanges.push({ action: 'unrevoke_subaccount', tokenToRevokeHex: token });
  }
  for (let index = 0; index < withHistory.length; index++) {
    const m = withHistory[index];
    const token = await MetaGroupWrapperActions.swarmSubAccountToken(groupPk, m);
    unrevokeChanges.push({ action: 'unrevoke_subaccount', tokenToRevokeHex: token });
  }
  for (let index = 0; index < removed.length; index++) {
    const m = removed[index];
    const token = await MetaGroupWrapperActions.swarmSubAccountToken(groupPk, m);
    revokeChanges.push({ action: 'revoke_subaccount', tokenToRevokeHex: token });
  }

  return SnodeAPIRevoke.getRevokeSubaccountParams(groupPk, secretKey, {
    revokeChanges,
    unrevokeChanges,
  });
}

class GroupPendingRemovalsJob extends PersistedJob<GroupPendingRemovalsPersistedData> {
  constructor({
    groupPk,
    nextAttemptTimestamp,
    maxAttempts,
    currentRetry,
    identifier,
  }: Pick<GroupPendingRemovalsPersistedData, 'groupPk'> &
    Partial<
      Pick<
        GroupPendingRemovalsPersistedData,
        | 'nextAttemptTimestamp'
        | 'identifier'
        | 'maxAttempts'
        | 'delayBetweenRetries'
        | 'currentRetry'
      >
    >) {
    super({
      jobType: 'GroupPendingRemovalJobType',
      identifier: identifier || v4(),
      groupPk,
      delayBetweenRetries: defaultMsBetweenRetries,
      maxAttempts: isNumber(maxAttempts) ? maxAttempts : defaultMaxAttempts,
      nextAttemptTimestamp: nextAttemptTimestamp || Date.now() + defaultMsBetweenRetries,
      currentRetry: isNumber(currentRetry) ? currentRetry : 0,
    });
  }

  public async run() {
    const { groupPk, jobType, identifier } = this.persistedData;

    window.log.info(`running job ${jobType} with groupPk:"${groupPk}" id:"${identifier}" `);
    const group = await UserGroupsWrapperActions.getGroup(groupPk);
    if (!group || !group.secretKey || isEmpty(group.secretKey)) {
      window.log.warn(
        `GroupPendingRemovalsJob: Did not find group in wrapper or no valid info in wrapper`
      );
      return RunJobResult.PermanentFailure;
    }

    try {
      const pendingRemovals = await MetaGroupWrapperActions.memberGetAllPendingRemovals(groupPk);

      if (!pendingRemovals.length) {
        return RunJobResult.Success;
      }
      const deleteMessagesOfMembers = pendingRemovals
        .filter(m => m.shouldRemoveMessages)
        .map(m => m.pubkeyHex);

      const sessionIdsHex = pendingRemovals.map(m => m.pubkeyHex);
      const sessionIds = sessionIdsHex.map(m => fromHexToArray(m).slice(1));
      const currentGen = await MetaGroupWrapperActions.keyGetCurrentGen(groupPk);
      const dataToEncrypt = sessionIds.map(s => {
        return concatUInt8Array(s, StringUtils.stringToUint8Array(`${currentGen}`));
      });

      const multiEncryptedMessage = await MultiEncryptWrapperActions.multiEncrypt({
        messages: dataToEncrypt,
        recipients: sessionIds,
        ed25519SecretKey: group.secretKey,
        domain: 'SessionGroupKickedMessage',
      });
      // first, get revoke requests that need to be pushed for leaving member
      const revokeUnrevokeParams = await getPendingRevokeParams({
        groupPk,
        withHistory: [],
        withoutHistory: [],
        removed: sessionIdsHex,
        secretKey: group.secretKey,
      });

      const multiEncryptRequest = new StoreGroupRevokedRetrievableSubRequest({
        encryptedData: multiEncryptedMessage,
        groupPk,
        secretKey: group.secretKey,
      });

      const revokeRequests = compact([
        revokeUnrevokeParams.revokeSubRequest ? revokeUnrevokeParams.revokeSubRequest : null,
        revokeUnrevokeParams.unrevokeSubRequest ? revokeUnrevokeParams.unrevokeSubRequest : null,
      ]);
      let storeRequests: Array<StoreGroupMessageSubRequest> = [];
      if (deleteMessagesOfMembers.length) {
        const deleteContentMsg = new GroupUpdateDeleteMemberContentMessage({
          createAtNetworkTimestamp: GetNetworkTime.now(),
          expirationType: 'unknown', // GroupUpdateDeleteMemberContentMessage this is not displayed so not expiring.
          expireTimer: 0,
          groupPk,
          memberSessionIds: deleteMessagesOfMembers,
          messageHashes: [],
          sodium: await getSodiumRenderer(),
          secretKey: group.secretKey,
        });
        storeRequests = await StoreGroupRequestFactory.makeGroupMessageSubRequest(
          [deleteContentMsg],
          { authData: null, secretKey: group.secretKey }
        );
      }

      const sortedSubRequests = compact([multiEncryptRequest, ...revokeRequests, ...storeRequests]);
      const result = await MessageSender.sendEncryptedDataToSnode({
        sortedSubRequests,
        destination: groupPk,
        method: 'sequence',
      });

      if (
        !result ||
        result.length !== sortedSubRequests.length ||
        result.some(m => m.code !== 200)
      ) {
        window.log.warn(
          'GroupPendingRemovalsJob: sendEncryptedDataToSnode unexpected result length or content. Scheduling retry if possible'
        );
        return RunJobResult.RetryJobIfPossible;
      }

      // both requests success, remove the members from the group member entirely and sync
      await MetaGroupWrapperActions.memberEraseAndRekey(groupPk, sessionIdsHex);
      await GroupSync.queueNewJobIfNeeded(groupPk);

      try {
        if (deleteMessagesOfMembers.length) {
          const msgHashesToDeleteOnGroupSwarm =
            await Data.deleteAllMessageFromSendersInConversation({
              groupPk,
              toRemove: deleteMessagesOfMembers,
              signatureTimestamp: GetNetworkTime.now(),
            });

          if (msgHashesToDeleteOnGroupSwarm.messageHashes.length) {
            const deleted = await deleteMessagesFromSwarmOnly(
              msgHashesToDeleteOnGroupSwarm.messageHashes,
              groupPk
            );
            if (deleted) {
              window.inboxStore?.dispatch(
                messageHashesExpired(
                  msgHashesToDeleteOnGroupSwarm.messageHashes.map(messageHash => ({
                    conversationKey: groupPk,
                    messageHash,
                  }))
                )
              );
            }
          }
        }
      } catch (e) {
        window.log.warn('GroupPendingRemovalsJob allowed to fail part failed with:', e.message);
      }

      // return true so this job is marked as a success and we don't need to retry it
      return RunJobResult.Success;
    } catch (e) {
      window.log.warn('GroupPendingRemovalsJob failed with', e.message);
      return RunJobResult.RetryJobIfPossible;
    }
  }

  public serializeJob() {
    return super.serializeBase();
  }

  public nonRunningJobsToRemove(_jobs: Array<GroupPendingRemovalsPersistedData>) {
    return [];
  }

  public addJobCheck(jobs: Array<GroupPendingRemovalsPersistedData>): AddJobCheckReturn {
    // avoid adding the same job if the exact same one is already planned
    const hasSameJob = jobs.some(j => {
      return j.groupPk === this.persistedData.groupPk;
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

export const GroupPendingRemovals = {
  addJob,
  getPendingRevokeParams,
};
