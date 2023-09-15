import { GroupPubkeyType } from 'libsession_util_nodejs';
import { MessageEncrypter, concatUInt8Array, getSodiumRenderer } from '.';
import { Data } from '../../data/data';
import { SignalService } from '../../protobuf';
import { assertUnreachable } from '../../types/sqlSharedTypes';
import { MetaGroupWrapperActions } from '../../webworker/workers/browser/libsession_worker_interface';
import { PubKey } from '../types';
import { UserUtils } from '../utils';
import { fromHexToArray } from '../utils/String';
import { SigningFailed } from '../utils/errors';
import { addMessagePadding } from './BufferPadding';

export { concatUInt8Array, getSodiumRenderer };

type EncryptResult = {
  envelopeType: SignalService.Envelope.Type;
  cipherText: Uint8Array;
};

async function encryptWithLibSession(destination: GroupPubkeyType, plainText: Uint8Array) {
  try {
    return MetaGroupWrapperActions.encryptMessage(destination, plainText, true);
  } catch (e) {
    window.log.warn('encrypt message for group failed with', e.message);
    throw new SigningFailed(e.message);
  }
}

async function encryptForLegacyGroup(destination: PubKey, plainText: Uint8Array) {
  const hexEncryptionKeyPair = await Data.getLatestClosedGroupEncryptionKeyPair(destination.key);
  if (!hexEncryptionKeyPair) {
    window?.log?.warn("Couldn't get key pair for closed group during encryption");
    throw new Error("Couldn't get key pair for closed group");
  }

  const destinationX25519Pk = PubKey.cast(hexEncryptionKeyPair.publicHex);

  const cipherTextClosedGroup = await MessageEncrypter.encryptUsingSessionProtocol(
    destinationX25519Pk,
    plainText
  );

  return {
    envelopeType: SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE,
    cipherText: cipherTextClosedGroup,
  };
}

/**
 * Encrypt `plainTextBuffer` with given `encryptionType` for `destination`.
 *
 * @param destination The device `PubKey` to encrypt for.
 * @param plainTextBuffer The unpadded plaintext buffer. It will be padded
 * @param encryptionType The type of encryption.
 * @returns The envelope type and the base64 encoded cipher text
 */
export async function encrypt(
  destination: PubKey,
  plainTextBuffer: Uint8Array,
  encryptionType: SignalService.Envelope.Type
): Promise<EncryptResult> {
  const { CLOSED_GROUP_MESSAGE, SESSION_MESSAGE } = SignalService.Envelope.Type;
  const plainTextPadded = addMessagePadding(plainTextBuffer);

  switch (encryptionType) {
    case SESSION_MESSAGE: {
      // if (destination.isPrivate || destination.isUS) {
      const cipherText = await MessageEncrypter.encryptUsingSessionProtocol(
        PubKey.cast(destination.key),
        plainTextPadded
      );
      return { envelopeType: SESSION_MESSAGE, cipherText };
      // }

      // if (destination.isGroupV2 || destination.isLegacyGroup) {
      //   throw new PreConditionFailed(
      //     'Encryption with SESSION_MESSAGE only work with destination private or us'
      //   );
      // }
      // assertUnreachable(
      //   destination,
      //   'Encryption with SESSION_MESSAGE only work with destination private or us'
      // );
    }

    case CLOSED_GROUP_MESSAGE: {
      const groupPk = destination.key;
      if (PubKey.isClosedGroupV2(groupPk)) {
        return {
          envelopeType: CLOSED_GROUP_MESSAGE,
          cipherText: await encryptWithLibSession(groupPk, plainTextBuffer),
        };
      }

      // if (destination.isLegacyGroup) {
      return encryptForLegacyGroup(destination, plainTextPadded); // not padding it again, it is already done by libsession
      // }
      // if (
      //   destination.isBlinded ||
      //   destination.isBlinded ||
      //   destination.isPrivate ||
      //   destination.isUS
      // ) {
      //   throw new PreConditionFailed(
      //     'Encryption with CLOSED_GROUP_MESSAGE only work with destination groupv2 or legacy group'
      //   );
      // }
      // assertUnreachable(
      //   destination,
      //   'Encryption with CLOSED_GROUP_MESSAGE only work with destination groupv2 or legacy group'
      // );
    }
    default:
      assertUnreachable(encryptionType, '');
  }
}

export async function encryptUsingSessionProtocol(
  destinationX25519Pk: PubKey,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const userED25519KeyPairHex = await UserUtils.getUserED25519KeyPair();
  if (
    !userED25519KeyPairHex ||
    !userED25519KeyPairHex.pubKey?.length ||
    !userED25519KeyPairHex.privKey?.length
  ) {
    throw new Error("Couldn't find user ED25519 key pair.");
  }
  const sodium = await getSodiumRenderer();

  const recipientX25519PublicKey = fromHexToArray(
    PubKey.removePrefixIfNeeded(destinationX25519Pk.key)
  );
  const userED25519PubKeyBytes = fromHexToArray(userED25519KeyPairHex.pubKey);
  const userED25519SecretKeyBytes = fromHexToArray(userED25519KeyPairHex.privKey);

  // merge all arrays into one
  const verificationData = concatUInt8Array(
    plaintext,
    userED25519PubKeyBytes,
    recipientX25519PublicKey
  );

  const signature = sodium.crypto_sign_detached(verificationData, userED25519SecretKeyBytes);
  if (!signature || signature.length === 0) {
    throw new Error("Couldn't sign message");
  }

  const plaintextWithMetadata = concatUInt8Array(plaintext, userED25519PubKeyBytes, signature);

  const ciphertext = sodium.crypto_box_seal(plaintextWithMetadata, recipientX25519PublicKey);
  if (!ciphertext) {
    throw new Error("Couldn't encrypt message.");
  }
  return ciphertext;
}
