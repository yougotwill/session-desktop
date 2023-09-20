import { compact, toNumber } from 'lodash';
import { RetrieveMessageItem } from '../types';
import { extractWebSocketContent } from '../swarmPolling';
import { SignalService } from '../../../../protobuf';
import { IncomingMessage } from '../../../messages/incoming/IncomingMessage';
import { EnvelopePlus } from '../../../../receiver/types';

function extractWebSocketContents(configMsgs: Array<RetrieveMessageItem>) {
  try {
    return compact(
      configMsgs.map((m: RetrieveMessageItem) => {
        return extractWebSocketContent(m.data, m.hash);
      })
    );
  } catch (e) {
    window.log.warn('extractWebSocketContents failed with ', e.message);
    return [];
  }
}

async function decryptSharedConfigMessages(
  extractedMsgs: ReturnType<typeof extractWebSocketContents>,
  decryptEnvelope: (envelope: EnvelopePlus) => Promise<ArrayBuffer | null>
) {
  const allDecryptedConfigMessages: Array<IncomingMessage<SignalService.ISharedConfigMessage>> = [];

  for (let index = 0; index < extractedMsgs.length; index++) {
    const groupConfigMessage = extractedMsgs[index];

    try {
      const envelope: EnvelopePlus = SignalService.Envelope.decode(groupConfigMessage.body) as any;
      // eslint-disable-next-line no-await-in-loop
      const decryptedEnvelope = await decryptEnvelope(envelope);
      if (!decryptedEnvelope?.byteLength) {
        continue;
      }
      const content = SignalService.Content.decode(new Uint8Array(decryptedEnvelope));
      if (content.sharedConfigMessage) {
        const asIncomingMsg: IncomingMessage<SignalService.ISharedConfigMessage> = {
          envelopeTimestamp: toNumber(envelope.timestamp),
          message: content.sharedConfigMessage,
          messageHash: groupConfigMessage.messageHash,
          authorOrGroupPubkey: envelope.source,
          authorInGroup: envelope.senderIdentity,
        };
        allDecryptedConfigMessages.push(asIncomingMsg);
      } else {
        throw new Error(
          'received a message to a namespace reserved for user config but not containign a sharedConfigMessage'
        );
      }
    } catch (e) {
      window.log.warn(
        `failed to decrypt message with hash "${groupConfigMessage.messageHash}": ${e.message}`
      );
    }
  }
  return allDecryptedConfigMessages;
}

export const SwarmPollingConfigShared = {
  decryptSharedConfigMessages,
  extractWebSocketContents,
};
