import { ConfigMessageHandler } from '../../../../receiver/configMessage';
import { decryptEnvelopeWithOurKey } from '../../../../receiver/contentMessage';
import { RetrieveMessageItem } from '../types';
import { SwarmPollingConfigShared } from './SwarmPollingConfigShared';

async function handleUserSharedConfigMessages(
  userConfigMessagesMerged: Array<RetrieveMessageItem>
) {
  window.log.info(`received userConfigMessagesMerged count: ${userConfigMessagesMerged.length}`);
  try {
    const extractedUserConfigMessage =
      SwarmPollingConfigShared.extractWebSocketContents(userConfigMessagesMerged);

    const allDecryptedConfigMessages = await SwarmPollingConfigShared.decryptSharedConfigMessages(
      extractedUserConfigMessage,
      decryptEnvelopeWithOurKey
    );

    if (allDecryptedConfigMessages.length) {
      try {
        window.log.info(
          `handleConfigMessagesViaLibSession of "${allDecryptedConfigMessages.length}" messages with libsession`
        );
        await ConfigMessageHandler.handleUserConfigMessagesViaLibSession(
          allDecryptedConfigMessages
        );
      } catch (e) {
        const allMessageHases = allDecryptedConfigMessages.map(m => m.messageHash).join(',');
        window.log.warn(
          `failed to handle messages hashes "${allMessageHases}" with libsession. Error: "${e.message}"`
        );
      }
    }
  } catch (e) {
    window.log.warn(
      `handleSharedConfigMessages of ${userConfigMessagesMerged.length} failed with ${e.message}`
    );
    // not rethrowing
  }
}

export const SwarmPollingUserConfig = { handleUserSharedConfigMessages };
