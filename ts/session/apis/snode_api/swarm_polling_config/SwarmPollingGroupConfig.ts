import { GroupPubkeyType } from 'libsession_util_nodejs';
import { groupInfoActions } from '../../../../state/ducks/groups';
import { MetaGroupWrapperActions } from '../../../../webworker/workers/browser/libsession_worker_interface';
import { ed25519Str } from '../../../onions/onionPath';
import { fromBase64ToArray } from '../../../utils/String';
import { LibSessionUtil } from '../../../utils/libsession/libsession_utils';
import { SnodeNamespaces } from '../namespaces';
import { RetrieveMessageItemWithNamespace } from '../types';

async function handleGroupSharedConfigMessages(
  groupConfigMessagesMerged: Array<RetrieveMessageItemWithNamespace>,
  groupPk: GroupPubkeyType
) {
  window.log.info(
    `received groupConfigMessagesMerged count: ${
      groupConfigMessagesMerged.length
    } for groupPk:${ed25519Str(groupPk)}`
  );
  try {
    const infos = groupConfigMessagesMerged
      .filter(m => m.namespace === SnodeNamespaces.ClosedGroupInfo)
      .map(info => {
        return { data: fromBase64ToArray(info.data), hash: info.hash };
      });
    const members = groupConfigMessagesMerged
      .filter(m => m.namespace === SnodeNamespaces.ClosedGroupMembers)
      .map(info => {
        return { data: fromBase64ToArray(info.data), hash: info.hash };
      });
    const keys = groupConfigMessagesMerged
      .filter(m => m.namespace === SnodeNamespaces.ClosedGroupKeys)
      .map(info => {
        return {
          data: fromBase64ToArray(info.data),
          hash: info.hash,
          timestampMs: info.timestamp,
        };
      });
    const toMerge = {
      groupInfo: infos,
      groupKeys: keys,
      groupMember: members,
    };

    // do the merge with our current state
    await MetaGroupWrapperActions.metaMerge(groupPk, toMerge);
    // save updated dumps to the DB right away
    await LibSessionUtil.saveMetaGroupDumpToDb(groupPk);

    // refresh the redux slice with the merged result
    window.inboxStore.dispatch(
      groupInfoActions.refreshGroupDetailsFromWrapper({
        groupPk,
      })
    );
  } catch (e) {
    window.log.warn(
      `handleGroupSharedConfigMessages of ${groupConfigMessagesMerged.length} failed with ${e.message}`
    );
    // not rethrowing
  }
}

export const SwarmPollingGroupConfig = { handleGroupSharedConfigMessages };
