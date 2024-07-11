import { PubkeyType, WithGroupPubkey } from 'libsession_util_nodejs';

export type DataCallArgs<T extends (args: any) => any> = Parameters<T>[0];

export type DeleteAllMessageFromSendersInConversationType = (
  args: WithGroupPubkey & {
    toRemove: Array<PubkeyType>;
    signatureTimestamp: number;
  }
) => Promise<{ messageHashes: Array<string> }>;

export type DeleteAllMessageHashesInConversationType = (
  args: WithGroupPubkey & {
    messageHashes: Array<string>;
    signatureTimestamp: number;
  }
) => Promise<{ messageHashes: Array<string> }>;

export type DeleteAllMessageHashesInConversationMatchingAuthorType = (
  args: WithGroupPubkey & {
    messageHashes: Array<string>;
    author: PubkeyType;
    signatureTimestamp: number;
  }
) => Promise<{ msgIdsDeleted: Array<string>; msgHashesDeleted: Array<string> }>;
