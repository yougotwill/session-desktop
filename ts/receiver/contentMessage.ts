import { EnvelopePlus } from './types';
import { handleSwarmDataMessage } from './dataMessage';

import { removeFromCache, updateCache } from './cache';
import { SignalService } from '../protobuf';
import { compact, flatten, identity, isEmpty, pickBy, toNumber } from 'lodash';
import { KeyPrefixType, PubKey } from '../session/types';

import { BlockedNumberController } from '../util/blockedNumberController';
import { GroupUtils, UserUtils } from '../session/utils';
import { fromHexToArray, toHex } from '../session/utils/String';
import { concatUInt8Array, getSodiumRenderer } from '../session/crypto';
import { getConversationController } from '../session/conversations';
import { ECKeyPair } from './keypairs';
import { handleConfigurationMessage } from './configMessage';
import { removeMessagePadding } from '../session/crypto/BufferPadding';
import { perfEnd, perfStart } from '../session/utils/Performance';
import { getAllCachedECKeyPair } from './closedGroups';
import { handleCallMessage } from './callMessage';
import { SettingsKey } from '../data/settings-key';
import { ReadReceipts } from '../util/readReceipts';
import { Storage } from '../util/storage';
import { Data } from '../data/data';
import {
  deleteMessagesFromSwarmAndCompletelyLocally,
  deleteMessagesFromSwarmAndMarkAsDeletedLocally,
} from '../interactions/conversations/unsendingInteractions';
import { ConversationTypeEnum } from '../models/conversationAttributes';
import { findCachedBlindedMatchOrLookupOnAllServers } from '../session/apis/open_group_api/sogsv3/knownBlindedkeys';
import { appendFetchAvatarAndProfileJob } from './userProfileImageUpdates';

export async function handleSwarmContentMessage(envelope: EnvelopePlus, messageHash: string) {
  try {
    const plaintext = await decrypt(envelope, envelope.content);

    if (!plaintext) {
      return;
    } else if (plaintext instanceof ArrayBuffer && plaintext.byteLength === 0) {
      return;
    }
    const sentAtTimestamp = toNumber(envelope.timestamp);
    // swarm messages already comes with a timestamp is milliseconds, so this sentAtTimestamp is correct.
    // the sogs messages do not come as milliseconds but just seconds, so we override it
    await innerHandleSwarmContentMessage(envelope, sentAtTimestamp, plaintext, messageHash);
  } catch (e) {
    window?.log?.warn(e);
  }
}

async function decryptForClosedGroup(envelope: EnvelopePlus, ciphertext: ArrayBuffer) {
  // case .closedGroupCiphertext: for ios
  window?.log?.info('received closed group message');
  try {
    const hexEncodedGroupPublicKey = envelope.source;
    if (!GroupUtils.isMediumGroup(PubKey.cast(hexEncodedGroupPublicKey))) {
      window?.log?.warn('received medium group message but not for an existing medium group');
      throw new Error('Invalid group public key'); // invalidGroupPublicKey
    }
    const encryptionKeyPairs = await getAllCachedECKeyPair(hexEncodedGroupPublicKey);

    const encryptionKeyPairsCount = encryptionKeyPairs?.length;
    if (!encryptionKeyPairs?.length) {
      throw new Error(`No group keypairs for group ${hexEncodedGroupPublicKey}`); // noGroupKeyPair
    }
    // Loop through all known group key pairs in reverse order (i.e. try the latest key pair first (which'll more than
    // likely be the one we want) but try older ones in case that didn't work)
    let decryptedContent: ArrayBuffer | undefined;
    let keyIndex = 0;

    // If an error happens in here, we catch it in the inner try-catch
    // When the loop is done, we check if the decryption is a success;
    // If not, we trigger a new Error which will trigger in the outer try-catch
    do {
      try {
        const hexEncryptionKeyPair = encryptionKeyPairs.pop();

        if (!hexEncryptionKeyPair) {
          throw new Error('No more encryption keypairs to try for message.');
        }
        const encryptionKeyPair = ECKeyPair.fromHexKeyPair(hexEncryptionKeyPair);

        decryptedContent = await decryptWithSessionProtocol(
          envelope,
          ciphertext,
          encryptionKeyPair,
          true
        );
        if (decryptedContent?.byteLength) {
          break;
        }
        keyIndex++;
      } catch (e) {
        window?.log?.info(
          `Failed to decrypt closed group with key index ${keyIndex}. We have ${encryptionKeyPairs.length} keys to try left.`
        );
      }
    } while (encryptionKeyPairs.length > 0);

    if (!decryptedContent?.byteLength) {
      throw new Error(
        `Could not decrypt message for closed group with any of the ${encryptionKeyPairsCount} keypairs.`
      );
    }
    if (keyIndex !== 0) {
      window?.log?.warn(
        'Decrypted a closed group message with not the latest encryptionkeypair we have'
      );
    }
    window?.log?.info('ClosedGroup Message decrypted successfully with keyIndex:', keyIndex);

    return removeMessagePadding(decryptedContent);
  } catch (e) {
    /**
     * If an error happened during the decoding,
     * we trigger a request to get the latest EncryptionKeyPair for this medium group.
     * Indeed, we might not have the latest one used by someone else, or not have any keypairs for this group.
     *
     */

    window?.log?.warn('decryptWithSessionProtocol for medium group message throw:', e.message);
    const groupPubKey = PubKey.cast(envelope.source);

    // IMPORTANT do not remove the message from the cache just yet.
    // We will try to decrypt it once we get the encryption keypair.
    // for that to work, we need to throw an error just like here.
    throw new Error(
      `Waiting for an encryption keypair to be received for group ${groupPubKey.key}`
    );
  }
}

/**
 * This function can be called to decrypt a keypair wrapper for a closed group update
 * or a message sent to a closed group.
 *
 * We do not unpad the result here, as in the case of the keypair wrapper, there is not padding.
 * Instead, it is the called who needs to removeMessagePadding() the content.
 */
export async function decryptWithSessionProtocol(
  envelope: EnvelopePlus,
  ciphertextObj: ArrayBuffer,
  x25519KeyPair: ECKeyPair,
  isClosedGroup?: boolean
): Promise<ArrayBuffer> {
  perfStart(`decryptWithSessionProtocol-${envelope.id}`);
  const recipientX25519PrivateKey = x25519KeyPair.privateKeyData;
  const hex = toHex(new Uint8Array(x25519KeyPair.publicKeyData));

  const recipientX25519PublicKey = PubKey.removePrefixIfNeeded(hex);

  const sodium = await getSodiumRenderer();
  const signatureSize = sodium.crypto_sign_BYTES;
  const ed25519PublicKeySize = sodium.crypto_sign_PUBLICKEYBYTES;

  // 1. ) Decrypt the message
  const plaintextWithMetadata = sodium.crypto_box_seal_open(
    new Uint8Array(ciphertextObj),
    fromHexToArray(recipientX25519PublicKey),
    new Uint8Array(recipientX25519PrivateKey)
  );
  if (plaintextWithMetadata.byteLength <= signatureSize + ed25519PublicKeySize) {
    perfEnd(`decryptWithSessionProtocol-${envelope.id}`, 'decryptWithSessionProtocol');

    throw new Error('Decryption failed.'); // throw Error.decryptionFailed;
  }

  // 2. ) Get the message parts
  const signatureStart = plaintextWithMetadata.byteLength - signatureSize;
  const signature = plaintextWithMetadata.subarray(signatureStart);
  const pubkeyStart = plaintextWithMetadata.byteLength - (signatureSize + ed25519PublicKeySize);
  const pubkeyEnd = plaintextWithMetadata.byteLength - signatureSize;
  const senderED25519PublicKey = plaintextWithMetadata.subarray(pubkeyStart, pubkeyEnd);
  const plainTextEnd = plaintextWithMetadata.byteLength - (signatureSize + ed25519PublicKeySize);
  const plaintext = plaintextWithMetadata.subarray(0, plainTextEnd);

  // 3. ) Verify the signature
  const isValid = sodium.crypto_sign_verify_detached(
    signature,
    concatUInt8Array(plaintext, senderED25519PublicKey, fromHexToArray(recipientX25519PublicKey)),
    senderED25519PublicKey
  );

  if (!isValid) {
    perfEnd(`decryptWithSessionProtocol-${envelope.id}`, 'decryptWithSessionProtocol');

    throw new Error('Invalid message signature.'); //throw Error.invalidSignature
  }
  // 4. ) Get the sender's X25519 public key
  const senderX25519PublicKey = sodium.crypto_sign_ed25519_pk_to_curve25519(senderED25519PublicKey);
  if (!senderX25519PublicKey) {
    perfEnd(`decryptWithSessionProtocol-${envelope.id}`, 'decryptWithSessionProtocol');

    throw new Error('Decryption failed.'); // Error.decryptionFailed
  }

  // set the sender identity on the envelope itself.
  if (isClosedGroup) {
    envelope.senderIdentity = `${KeyPrefixType.standard}${toHex(senderX25519PublicKey)}`;
  } else {
    envelope.source = `${KeyPrefixType.standard}${toHex(senderX25519PublicKey)}`;
  }
  perfEnd(`decryptWithSessionProtocol-${envelope.id}`, 'decryptWithSessionProtocol');

  return plaintext;
}

export async function isBlocked(number: string) {
  return BlockedNumberController.isBlockedAsync(number);
}

async function decryptUnidentifiedSender(
  envelope: EnvelopePlus,
  ciphertext: ArrayBuffer
): Promise<ArrayBuffer | null> {
  // window?.log?.info('received unidentified sender message');
  try {
    const userX25519KeyPair = await UserUtils.getIdentityKeyPair();

    if (!userX25519KeyPair) {
      throw new Error('Failed to find User x25519 keypair from stage'); // noUserX25519KeyPair
    }

    const ecKeyPair = ECKeyPair.fromArrayBuffer(
      userX25519KeyPair.pubKey,
      userX25519KeyPair.privKey
    );

    // keep the await so the try catch works as expected
    perfStart(`decryptUnidentifiedSender-${envelope.id}`);

    const retSessionProtocol = await decryptWithSessionProtocol(envelope, ciphertext, ecKeyPair);

    const ret = removeMessagePadding(retSessionProtocol);
    perfEnd(`decryptUnidentifiedSender-${envelope.id}`, 'decryptUnidentifiedSender');

    return ret;
  } catch (e) {
    window?.log?.warn('decryptWithSessionProtocol for unidentified message throw:', e);
    return null;
  }
}

async function doDecrypt(
  envelope: EnvelopePlus,
  ciphertext: ArrayBuffer
): Promise<ArrayBuffer | null> {
  if (ciphertext.byteLength === 0) {
    throw new Error('Received an empty envelope.'); // Error.noData
  }

  switch (envelope.type) {
    // Only SESSION_MESSAGE and CLOSED_GROUP_MESSAGE are supported
    case SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE:
      return decryptForClosedGroup(envelope, ciphertext);
    case SignalService.Envelope.Type.SESSION_MESSAGE: {
      return decryptUnidentifiedSender(envelope, ciphertext);
    }
    default:
      throw new Error(`Unknown message type:${envelope.type}`);
  }
}

// tslint:disable-next-line: max-func-body-length
async function decrypt(envelope: EnvelopePlus, ciphertext: ArrayBuffer): Promise<any> {
  try {
    const plaintext = await doDecrypt(envelope, ciphertext);

    if (!plaintext) {
      await removeFromCache(envelope);
      return null;
    }

    perfStart(`updateCache-${envelope.id}`);

    await updateCache(envelope, plaintext).catch((error: any) => {
      window?.log?.error(
        'decrypt failed to save decrypted message contents to cache:',
        error && error.stack ? error.stack : error
      );
    });
    perfEnd(`updateCache-${envelope.id}`, 'updateCache');

    return plaintext;
  } catch (error) {
    throw error;
  }
}

function shouldDropBlockedUserMessage(
  content: SignalService.Content,
  groupPubkey: string
): boolean {
  // Even if the user is blocked, we should allow the message if:
  //   - it is a group message AND
  //   - the group exists already on the db (to not join a closed group created by a blocked user) AND
  //   - the group is not blocked AND
  //   - the message is only control (no body/attachments/quote/groupInvitation/contact/preview)

  if (!groupPubkey) {
    return true;
  }

  const groupConvo = getConversationController().get(groupPubkey);
  if (!groupConvo || !groupConvo.isClosedGroup()) {
    return true;
  }

  if (groupConvo.isBlocked()) {
    return true;
  }

  // first check that dataMessage is the only field set in the Content
  let msgWithoutDataMessage = pickBy(
    content,
    (_value, key) => key !== 'dataMessage' && key !== 'toJSON'
  );
  msgWithoutDataMessage = pickBy(msgWithoutDataMessage, identity);

  const isMessageDataMessageOnly = isEmpty(msgWithoutDataMessage);
  if (!isMessageDataMessageOnly) {
    return true;
  }
  const data = content.dataMessage as SignalService.DataMessage; // forcing it as we do know this field is set based on last line
  const isControlDataMessageOnly =
    !data.body &&
    !data.preview?.length &&
    !data.attachments?.length &&
    !data.openGroupInvitation &&
    !data.quote;

  return !isControlDataMessageOnly;
}

// tslint:disable-next-line: cyclomatic-complexity
export async function innerHandleSwarmContentMessage(
  envelope: EnvelopePlus,
  sentAtTimestamp: number,
  plaintext: ArrayBuffer,
  messageHash: string
): Promise<void> {
  try {
    perfStart(`SignalService.Content.decode-${envelope.id}`);
    window.log.info('innerHandleSwarmContentMessage');
    perfStart(`isBlocked-${envelope.id}`);

    const content = SignalService.Content.decode(new Uint8Array(plaintext));
    perfEnd(`SignalService.Content.decode-${envelope.id}`, 'SignalService.Content.decode');

    /**
     * senderIdentity is set ONLY if that message is a closed group message.
     * If the current message is a closed group message,
     * envelope.source is going to be the real sender of that message.
     *
     * When receiving a message from a user which we blocked, we need to make let
     * a control message through (if the associated closed group is not blocked)
     */

    const blocked = await isBlocked(envelope.senderIdentity || envelope.source);
    perfEnd(`isBlocked-${envelope.id}`, 'isBlocked');
    if (blocked) {
      const envelopeSource = envelope.source;
      // We want to allow a blocked user message if that's a control message for a known group and the group is not blocked
      if (shouldDropBlockedUserMessage(content, envelopeSource)) {
        window?.log?.info('Dropping blocked user message');
        return;
      } else {
        window?.log?.info('Allowing group-control message only from blocked user');
      }
    }

    // if this is a direct message, envelope.senderIdentity is undefined
    // if this is a closed group message, envelope.senderIdentity is the sender's pubkey and envelope.source is the closed group's pubkey
    const isPrivateConversationMessage = !envelope.senderIdentity;

    /**
     * For a closed group message, this holds the conversation with that specific user outside of the closed group.
     * For a private conversation message, this is just the conversation with that user
     */
    const senderConversationModel = await getConversationController().getOrCreateAndWait(
      isPrivateConversationMessage ? envelope.source : envelope.senderIdentity,
      ConversationTypeEnum.PRIVATE
    );

    /**
     * For a closed group message, this holds the closed group's conversation.
     * For a private conversation message, this is just the conversation with that user
     */
    if (!isPrivateConversationMessage) {
      // this is a closed group message, we have a second conversation to make sure exists
      await getConversationController().getOrCreateAndWait(
        envelope.source,
        ConversationTypeEnum.GROUP
      );
    }

    if (content.dataMessage) {
      // because typescript is funky with incoming protobufs
      if (content.dataMessage.profileKey && content.dataMessage.profileKey.length === 0) {
        content.dataMessage.profileKey = null;
      }
      perfStart(`handleSwarmDataMessage-${envelope.id}`);
      await handleSwarmDataMessage(
        envelope,
        sentAtTimestamp,
        content.dataMessage as SignalService.DataMessage,
        messageHash,
        senderConversationModel
      );
      perfEnd(`handleSwarmDataMessage-${envelope.id}`, 'handleSwarmDataMessage');
      return;
    }

    if (content.receiptMessage) {
      perfStart(`handleReceiptMessage-${envelope.id}`);

      await handleReceiptMessage(envelope, content.receiptMessage);
      perfEnd(`handleReceiptMessage-${envelope.id}`, 'handleReceiptMessage');
      return;
    }
    if (content.typingMessage) {
      perfStart(`handleTypingMessage-${envelope.id}`);

      await handleTypingMessage(envelope, content.typingMessage as SignalService.TypingMessage);
      perfEnd(`handleTypingMessage-${envelope.id}`, 'handleTypingMessage');
      return;
    }
    if (content.configurationMessage) {
      // this one can be quite long (downloads profilePictures and everything, is do not block)
      void handleConfigurationMessage(
        envelope,
        content.configurationMessage as SignalService.ConfigurationMessage
      );
      return;
    }
    if (content.dataExtractionNotification) {
      perfStart(`handleDataExtractionNotification-${envelope.id}`);

      await handleDataExtractionNotification(
        envelope,
        content.dataExtractionNotification as SignalService.DataExtractionNotification
      );
      perfEnd(
        `handleDataExtractionNotification-${envelope.id}`,
        'handleDataExtractionNotification'
      );
      return;
    }
    if (content.unsendMessage) {
      await handleUnsendMessage(envelope, content.unsendMessage as SignalService.Unsend);
    }
    if (content.callMessage) {
      await handleCallMessage(envelope, content.callMessage as SignalService.CallMessage);
    }
    if (content.messageRequestResponse) {
      await handleMessageRequestResponse(
        envelope,
        content.messageRequestResponse as SignalService.MessageRequestResponse
      );
    }
  } catch (e) {
    window?.log?.warn(e);
  }
}

function onReadReceipt(readAt: number, timestamp: number, source: string) {
  window?.log?.info('read receipt', source, timestamp);

  if (!Storage.get(SettingsKey.settingsReadReceipt)) {
    return;
  }

  // Calling this directly so we can wait for completion
  return ReadReceipts.onReadReceipt({
    source,
    timestamp,
    readAt,
  });
}

async function handleReceiptMessage(
  envelope: EnvelopePlus,
  receiptMessage: SignalService.IReceiptMessage
) {
  const receipt = receiptMessage as SignalService.ReceiptMessage;

  const { type, timestamp } = receipt;

  const results = [];
  if (type === SignalService.ReceiptMessage.Type.READ) {
    for (const ts of timestamp) {
      const promise = onReadReceipt(toNumber(envelope.timestamp), toNumber(ts), envelope.source);
      results.push(promise);
    }
  }
  await Promise.all(results);

  await removeFromCache(envelope);
}

async function handleTypingMessage(
  envelope: EnvelopePlus,
  typingMessage: SignalService.TypingMessage
): Promise<void> {
  const { timestamp, action } = typingMessage;
  const { source } = envelope;

  await removeFromCache(envelope);

  // We don't do anything with incoming typing messages if the setting is disabled
  if (!Storage.get(SettingsKey.settingsTypingIndicator)) {
    return;
  }

  if (envelope.timestamp && timestamp) {
    const envelopeTimestamp = toNumber(envelope.timestamp);
    const typingTimestamp = toNumber(timestamp);

    if (typingTimestamp !== envelopeTimestamp) {
      window?.log?.warn(
        `Typing message envelope timestamp (${envelopeTimestamp}) did not match typing timestamp (${typingTimestamp})`
      );
      return;
    }
  }

  // typing message are only working with direct chats/ not groups
  const conversation = getConversationController().get(source);

  const started = action === SignalService.TypingMessage.Action.STARTED;

  if (conversation) {
    // this does not commit, instead the caller should commit to trigger UI updates
    await conversation.notifyTypingNoCommit({
      isTyping: started,
      sender: source,
    });
    await conversation.commit();
  }
}

/**
 * delete message from user swarm and delete locally upon receiving unsend request
 * @param unsendMessage data required to delete message
 */
async function handleUnsendMessage(envelope: EnvelopePlus, unsendMessage: SignalService.Unsend) {
  const { author: messageAuthor, timestamp } = unsendMessage;
  window.log.info(`handleUnsendMessage from ${messageAuthor}: of timestamp: ${timestamp}`);
  if (messageAuthor !== (envelope.senderIdentity || envelope.source)) {
    window?.log?.error(
      'handleUnsendMessage: Dropping request as the author and the sender differs.'
    );
    await removeFromCache(envelope);

    return;
  }
  if (!unsendMessage) {
    window?.log?.error('handleUnsendMessage: Invalid parameters -- dropping message.');
    await removeFromCache(envelope);

    return;
  }
  if (!timestamp) {
    window?.log?.error('handleUnsendMessage: Invalid timestamp -- dropping message');
    await removeFromCache(envelope);

    return;
  }
  const messageToDelete = (
    await Data.getMessagesBySenderAndSentAt([
      {
        source: messageAuthor,
        timestamp: toNumber(timestamp),
      },
    ])
  )?.models?.[0];
  const messageHash = messageToDelete?.get('messageHash');
  //#endregion

  //#region executing deletion
  if (messageHash && messageToDelete) {
    window.log.info('handleUnsendMessage: got a request to delete ', messageHash);
    const conversation = getConversationController().get(messageToDelete.get('conversationId'));
    if (!conversation) {
      await removeFromCache(envelope);

      return;
    }
    if (messageToDelete.getSource() === UserUtils.getOurPubKeyStrFromCache()) {
      // a message we sent is completely removed when we get a unsend request
      void deleteMessagesFromSwarmAndCompletelyLocally(conversation, [messageToDelete]);
    } else {
      void deleteMessagesFromSwarmAndMarkAsDeletedLocally(conversation, [messageToDelete]);
    }
  } else {
    window.log.info(
      'handleUnsendMessage: got a request to delete an unknown messageHash:',
      messageHash,
      ' and found messageToDelete:',
      messageToDelete?.id
    );
  }
  await removeFromCache(envelope);
}

/**
 * Sets approval fields for conversation depending on response's values. If request is approving, pushes notification and
 */
async function handleMessageRequestResponse(
  envelope: EnvelopePlus,
  messageRequestResponse: SignalService.MessageRequestResponse
) {
  const { isApproved } = messageRequestResponse;
  if (!isApproved) {
    window?.log?.error('handleMessageRequestResponse: isApproved is false -- dropping message.');
    await removeFromCache(envelope);
    return;
  }
  if (!messageRequestResponse) {
    window?.log?.error('handleMessageRequestResponse: Invalid parameters -- dropping message.');
    await removeFromCache(envelope);
    return;
  }

  const sodium = await getSodiumRenderer();

  const convosToMerge = findCachedBlindedMatchOrLookupOnAllServers(envelope.source, sodium);
  const unblindedConvoId = envelope.source;

  const conversationToApprove = await getConversationController().getOrCreateAndWait(
    unblindedConvoId,
    ConversationTypeEnum.PRIVATE
  );
  let mostRecentActiveAt = Math.max(...compact(convosToMerge.map(m => m.get('active_at'))));
  if (!isFinite(mostRecentActiveAt) || mostRecentActiveAt <= 0) {
    mostRecentActiveAt = toNumber(envelope.timestamp);
  }

  conversationToApprove.set({
    active_at: mostRecentActiveAt,
    isApproved: true,
    didApproveMe: true,
  });

  if (convosToMerge.length) {
    // merge fields we care by hand
    conversationToApprove.set({
      profileKey: convosToMerge[0].get('profileKey'),
      displayNameInProfile: convosToMerge[0].get('displayNameInProfile'),

      avatarInProfile: convosToMerge[0].get('avatarInProfile'),
      avatarPointer: convosToMerge[0].get('avatarPointer'), // don't set the avatar pointer
      // nickname might be set already in conversationToApprove, so don't overwrite it
    });

    // we have to merge all of those to a single conversation under the unblinded. including the messages
    window.log.info(
      `We just found out ${unblindedConvoId} matches some blinded conversations. Merging them together:`,
      convosToMerge.map(m => m.id)
    );
    // get all the messages from each conversations we have to merge
    const allMessagesCollections = await Promise.all(
      convosToMerge.map(async convoToMerge =>
        // this call will fetch like 60 messages for each conversation. I don't think we want to merge an unknown number of messages
        // so lets stick to this behavior
        Data.getMessagesByConversation(convoToMerge.id, {
          skipTimerInit: undefined,
          messageId: null,
        })
      )
    );

    const allMessageModels = flatten(allMessagesCollections.map(m => m.messages.models));
    allMessageModels.forEach(messageModel => {
      messageModel.set({ conversationId: unblindedConvoId });

      if (messageModel.get('source') !== UserUtils.getOurPubKeyStrFromCache()) {
        messageModel.set({ source: unblindedConvoId });
      }
    });
    // this is based on the messageId as  primary key. So this should overwrite existing messages with new merged data
    await Data.saveMessages(allMessageModels.map(m => m.attributes));

    // tslint:disable-next-line: prefer-for-of
    for (let index = 0; index < convosToMerge.length; index++) {
      const element = convosToMerge[index];
      await getConversationController().deleteBlindedContact(element.id);
    }
  }

  if (messageRequestResponse.profile && !isEmpty(messageRequestResponse.profile)) {
    void appendFetchAvatarAndProfileJob(
      conversationToApprove,
      messageRequestResponse.profile,
      messageRequestResponse.profileKey
    );
  }

  if (!conversationToApprove || conversationToApprove.didApproveMe() === isApproved) {
    if (conversationToApprove) {
      await conversationToApprove.commit();
    }
    window?.log?.info(
      'Conversation already contains the correct value for the didApproveMe field.'
    );
    await removeFromCache(envelope);

    return;
  }

  await conversationToApprove.setDidApproveMe(isApproved, true);
  if (isApproved === true) {
    // Conversation was not approved before so a sync is needed
    await conversationToApprove.addIncomingApprovalMessage(
      toNumber(envelope.timestamp),
      unblindedConvoId
    );
  }

  await removeFromCache(envelope);
}

/**
 * A DataExtractionNotification message can only come from a 1 o 1 conversation.
 *
 * We drop them if the convo is not a 1 o 1 conversation.
 */
export async function handleDataExtractionNotification(
  envelope: EnvelopePlus,
  dataNotificationMessage: SignalService.DataExtractionNotification
): Promise<void> {
  // we currently don't care about the timestamp included in the field itself, just the timestamp of the envelope
  const { type, timestamp: referencedAttachment } = dataNotificationMessage;

  const { source, timestamp } = envelope;
  await removeFromCache(envelope);

  const convo = getConversationController().get(source);
  if (!convo || !convo.isPrivate() || !Storage.get(SettingsKey.settingsReadReceipt)) {
    window?.log?.info(
      'Got DataNotification for unknown or non private convo or read receipt not enabled'
    );
    return;
  }

  if (!type || !source) {
    window?.log?.info('DataNotification pre check failed');

    return;
  }

  if (timestamp) {
    const envelopeTimestamp = toNumber(timestamp);
    const referencedAttachmentTimestamp = toNumber(referencedAttachment);

    await convo.addSingleIncomingMessage({
      source,
      sent_at: envelopeTimestamp,
      dataExtractionNotification: {
        type,
        referencedAttachmentTimestamp, // currently unused
        source,
      },
      unread: 1, // 1 means unread
      expireTimer: 0,
    });
    convo.updateLastMessage();
  }
}
