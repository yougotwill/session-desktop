import { v4 as uuid } from 'uuid';

export interface MessageParams {
  timestamp: number;
  identifier?: string;
}

export abstract class Message {
  public readonly timestamp: number;
  public readonly identifier: string;

  constructor({ timestamp, identifier }: MessageParams) {
    this.timestamp = timestamp;
    if (identifier && identifier.length === 0) {
      throw new Error('Cannot set empty identifier');
    }

    if (!timestamp || timestamp <= 0) {
      throw new Error('Cannot set undefined timestamp or <=0');
    }
    this.identifier = identifier || uuid();
  }
}
