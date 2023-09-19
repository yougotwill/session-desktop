import { PubKey } from '../types';
import { getConversationController } from '../conversations';
import { fromHexToArray } from './String';

export function isClosedGroup(groupId: PubKey): boolean {
  const conversation = getConversationController().get(groupId.key);

  if (!conversation) {
    return false;
  }

  return Boolean(conversation.isClosedGroup());
}

export function encodeGroupPubKeyFromHex(hexGroupPublicKey: string | PubKey) {
  const pubkey = PubKey.cast(hexGroupPublicKey);
  return fromHexToArray(pubkey.key);
}
