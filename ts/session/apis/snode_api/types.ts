import { SnodeNamespaces } from './namespaces';

export type RetrieveMessageItem = {
  hash: string;
  expiration: number;
  data: string; // base64 encrypted content of the message
  storedAt: number; // **not** the envelope timestamp, but when the message was effectively stored on the snode
};

export type RetrieveMessageItemWithNamespace = RetrieveMessageItem & {
  namespace: SnodeNamespaces; // the namespace from which this message was fetched
};

export type RetrieveMessagesResultsContent = {
  hf?: Array<number>;
  messages?: Array<RetrieveMessageItem>;
  more: boolean;
  t: number;
};

export type RetrieveRequestResult = {
  code: number;
  messages: RetrieveMessagesResultsContent;
  namespace: SnodeNamespaces;
};

export type RetrieveMessagesResultsBatched = Array<RetrieveRequestResult>;

export type WithTimestamp = { timestamp: number };
export type ShortenOrExtend = 'extend' | 'shorten' | '';
export type WithShortenOrExtend = { shortenOrExtend: ShortenOrExtend };
export type WithMessagesHashes = { messagesHashes: Array<string> };
