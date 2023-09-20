// this is not a very good name, but a configuration message is a message sent to our other devices so sync our current public and closed groups
import Long from 'long';

import { SignalService } from '../../../../protobuf';
import { MessageParams } from '../Message';
import { ContentMessage } from '..';
import { TTL_DEFAULT } from '../../../constants';
import { UserConfigKind } from '../../../../types/ProtobufKind';

interface SharedConfigParams<KindsPicked extends UserConfigKind> extends MessageParams {
  seqno: Long;
  data: Uint8Array;
  kind: KindsPicked;
}

export abstract class SharedConfigMessage<
  KindsPicked extends UserConfigKind,
> extends ContentMessage {
  public readonly seqno: Long;
  public readonly kind: KindsPicked;
  public readonly data: Uint8Array;

  constructor(params: SharedConfigParams<KindsPicked>) {
    super({ timestamp: params.timestamp, identifier: params.identifier });
    this.data = params.data;
    this.kind = params.kind;
    this.seqno = params.seqno;
  }

  public contentProto(): SignalService.Content {
    return new SignalService.Content({
      sharedConfigMessage: this.sharedConfigProto(),
    });
  }

  public ttl(): number {
    return TTL_DEFAULT.TTL_CONFIG;
  }

  protected sharedConfigProto(): SignalService.SharedConfigMessage {
    return new SignalService.SharedConfigMessage({
      data: this.data,
      kind: this.kind,
      seqno: this.seqno,
    });
  }
}

export class SharedUserConfigMessage extends SharedConfigMessage<UserConfigKind> {
  constructor(params: SharedConfigParams<UserConfigKind>) {
    super({
      timestamp: params.timestamp,
      identifier: params.identifier,
      data: params.data,
      kind: params.kind,
      seqno: params.seqno,
    });
  }
}
