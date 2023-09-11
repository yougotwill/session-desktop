import { GroupPubkeyType } from 'libsession_util_nodejs';
import { EnvelopePlus } from '../../../../receiver/types';
import { ed25519Str } from '../../../onions/onionPath';
import { RetrieveMessageItem } from '../types';
import { SwarmPollingConfigShared } from './SwarmPollingConfigShared';

async function handleGroupSharedConfigMessages(
  groupConfigMessagesMerged: Array<RetrieveMessageItem>,
  groupPk: GroupPubkeyType
) {
  window.log.info(
    `received groupConfigMessagesMerged count: ${
      groupConfigMessagesMerged.length
    } for groupPk:${ed25519Str(groupPk)}`
  );
  try {
    const extractedConfigMessage = SwarmPollingConfigShared.extractWebSocketContents(
      groupConfigMessagesMerged
    );

    const allDecryptedConfigMessages = await SwarmPollingConfigShared.decryptSharedConfigMessages(
      extractedConfigMessage,
      async (_envelope: EnvelopePlus) => {
        console.warn('decrypt closed group incoming shared message to do');
        return null;
      }
    );

    if (allDecryptedConfigMessages.length) {
      try {
        window.log.info(
          `handleGroupSharedConfigMessages of "${allDecryptedConfigMessages.length}" messages with libsession`
        );
        console.warn('HANDLING OF INCOMING GROUP TODO ');
        // await ConfigMessageHandler.handleUserConfigMessagesViaLibSession(
        //   allDecryptedConfigMessages
        // );
      } catch (e) {
        const allMessageHases = allDecryptedConfigMessages.map(m => m.messageHash).join(',');
        window.log.warn(
          `failed to handle group messages hashes "${allMessageHases}" with libsession. Error: "${e.message}"`
        );
      }
    }
  } catch (e) {
    window.log.warn(
      `handleGroupSharedConfigMessages of ${groupConfigMessagesMerged.length} failed with ${e.message}`
    );
    // not rethrowing
  }
}

export const SwarmPollingGroupConfig = { handleGroupSharedConfigMessages };
