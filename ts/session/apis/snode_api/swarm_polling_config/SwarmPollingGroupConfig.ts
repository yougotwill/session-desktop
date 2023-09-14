import { GroupPubkeyType } from 'libsession_util_nodejs';
import { stringify } from '../../../../types/sqlSharedTypes';
import { MetaGroupWrapperActions } from '../../../../webworker/workers/browser/libsession_worker_interface';
import { ed25519Str } from '../../../onions/onionPath';
import { fromBase64ToArray } from '../../../utils/String';
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
    console.info(`About to merge ${stringify(toMerge)}`);
    console.info(`dumps before ${stringify(await MetaGroupWrapperActions.metaDump(groupPk))}`);
    console.info(
      `groupInfo before merge: ${stringify(await MetaGroupWrapperActions.infoGet(groupPk))}`
    );
    const countMerged = await MetaGroupWrapperActions.metaMerge(groupPk, toMerge);
    console.info(
      `countMerged ${countMerged}, groupInfo after merge: ${stringify(
        await MetaGroupWrapperActions.infoGet(groupPk)
      )}`
    );
    console.info(`dumps after ${stringify(await MetaGroupWrapperActions.metaDump(groupPk))}`);

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
