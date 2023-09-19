import { GroupPubkeyType } from 'libsession_util_nodejs';
import { stringify } from '../../../../types/sqlSharedTypes';
import { MetaGroupWrapperActions } from '../../../../webworker/workers/browser/libsession_worker_interface';
import { ed25519Str } from '../../../onions/onionPath';
import { fromBase64ToArray } from '../../../utils/String';
import { SnodeNamespaces } from '../namespaces';
import { RetrieveMessageItemWithNamespace } from '../types';
import { groupInfoActions } from '../../../../state/ducks/groups';
import { LibSessionUtil } from '../../../utils/libsession/libsession_utils';

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
    console.info(
      `groupInfo before merge: ${stringify(await MetaGroupWrapperActions.infoGet(groupPk))}`
    );

    await MetaGroupWrapperActions.metaMerge(groupPk, toMerge);
    await LibSessionUtil.saveMetaGroupDumpToDb(groupPk);

    const updatedInfos = await MetaGroupWrapperActions.infoGet(groupPk);
    const updatedMembers = await MetaGroupWrapperActions.memberGetAll(groupPk);
    console.info(`groupInfo after merge: ${stringify(updatedInfos)}`);
    console.info(`groupMembers after merge: ${stringify(updatedMembers)}`);
    if (!updatedInfos || !updatedMembers) {
      throw new Error('updatedInfos or updatedMembers is null but we just created them');
    }

    window.inboxStore.dispatch(
      groupInfoActions.updateGroupDetailsAfterMerge({
        groupPk,
        infos: updatedInfos,
        members: updatedMembers,
      })
    );

    // if (allDecryptedConfigMessages.length) {
    //   try {
    //     window.log.info(
    //       `handleGroupSharedConfigMessages of "${allDecryptedConfigMessages.length}" messages with libsession`
    //     );
    //     console.warn('HANDLING OF INCOMING GROUP TODO ');
    //     // await ConfigMessageHandler.handleUserConfigMessagesViaLibSession(
    //     //   allDecryptedConfigMessages
    //     // );
    //   } catch (e) {
    //     const allMessageHases = allDecryptedConfigMessages.map(m => m.messageHash).join(',');
    //     window.log.warn(
    //       `failed to handle group messages hashes "${allMessageHases}" with libsession. Error: "${e.message}"`
    //     );
    //   }
    // }
  } catch (e) {
    window.log.warn(
      `handleGroupSharedConfigMessages of ${groupConfigMessagesMerged.length} failed with ${e.message}`
    );
    // not rethrowing
  }
}

export const SwarmPollingGroupConfig = { handleGroupSharedConfigMessages };
