import { GroupPubkeyType } from 'libsession_util_nodejs';
import { groupInfoActions } from '../../../../state/ducks/groups';
import { MetaGroupWrapperActions } from '../../../../webworker/workers/browser/libsession_worker_interface';
import { ed25519Str } from '../../../onions/onionPath';
import { fromBase64ToArray } from '../../../utils/String';
import { LibSessionUtil } from '../../../utils/libsession/libsession_utils';
import { SnodeNamespaces } from '../namespaces';
import { RetrieveMessageItemWithNamespace } from '../types';

async function handleGroupSharedConfigMessages(
  groupConfigMessages: Array<RetrieveMessageItemWithNamespace>,
  groupPk: GroupPubkeyType
) {
  try {
    window.log.info(
      `received groupConfigMessages count: ${groupConfigMessages.length} for groupPk:${ed25519Str(
        groupPk
      )}`
    );

    if (groupConfigMessages.find(m => !m.storedAt)) {
      debugger;
      throw new Error('all incoming group config message should have a timestamp');
    }
    const infos = groupConfigMessages
      .filter(m => m.namespace === SnodeNamespaces.ClosedGroupInfo)
      .map(info => {
        return { data: fromBase64ToArray(info.data), hash: info.hash };
      });
    const members = groupConfigMessages
      .filter(m => m.namespace === SnodeNamespaces.ClosedGroupMembers)
      .map(info => {
        return { data: fromBase64ToArray(info.data), hash: info.hash };
      });
    const keys = groupConfigMessages
      .filter(m => m.namespace === SnodeNamespaces.ClosedGroupKeys)
      .map(info => {
        return {
          data: fromBase64ToArray(info.data),
          hash: info.hash,
          timestampMs: info.storedAt,
        };
      });
    const toMerge = {
      groupInfo: infos,
      groupKeys: keys,
      groupMember: members,
    };

    window.log.info(
      `received keys: ${toMerge.groupKeys.length},infos: ${toMerge.groupInfo.length},members: ${
        toMerge.groupMember.length
      } for groupPk:${ed25519Str(groupPk)}`
    );
    // do the merge with our current state
    await MetaGroupWrapperActions.metaMerge(groupPk, toMerge);
    // save updated dumps to the DB right away
    await LibSessionUtil.saveDumpsToDb(groupPk);

    // refresh the redux slice with the merged result
    window.inboxStore.dispatch(
      groupInfoActions.refreshGroupDetailsFromWrapper({
        groupPk,
      })
    );
  } catch (e) {
    window.log.warn(
      `handleGroupSharedConfigMessages of ${groupConfigMessages.length} failed with ${e.message}`
    );
    // not rethrowing
  }
}

export const SwarmPollingGroupConfig = { handleGroupSharedConfigMessages };
