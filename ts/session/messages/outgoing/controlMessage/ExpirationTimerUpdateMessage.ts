import { SignalService } from '../../../../protobuf';
import { PubKey } from '../../../types';
import { StringUtils } from '../../../utils';
import { DataMessage } from '../DataMessage';
import { ExpirableMessageParams } from '../ExpirableMessage';

interface ExpirationTimerUpdateMessageParams extends ExpirableMessageParams {
  groupId?: string | PubKey;
  syncTarget?: string | PubKey;
  lastDisappearingMessageChangeTimestamp?: number;
}

// NOTE legacy messages used a data message for the expireTimer.
// The new ones use properties on the Content Message

export class ExpirationTimerUpdateMessage extends DataMessage {
  public readonly groupId?: PubKey;
  public readonly syncTarget?: string;
  public readonly lastDisappearingMessageChangeTimestamp?: number;

  constructor(params: ExpirationTimerUpdateMessageParams) {
    super({
      timestamp: params.timestamp,
      identifier: params.identifier,
      expirationType: params.expirationType,
      expireTimer: params.expireTimer,
    });

    this.lastDisappearingMessageChangeTimestamp = params.lastDisappearingMessageChangeTimestamp;

    const { groupId } = params;
    this.groupId = groupId ? PubKey.cast(groupId) : undefined;
    this.syncTarget = params.syncTarget ? PubKey.cast(params.syncTarget).key : undefined;
  }

  public contentProto(): SignalService.Content {
    return new SignalService.Content({
      ...super.contentProto(),
      dataMessage: this.dataProto(),
      lastDisappearingMessageChangeTimestamp: this.lastDisappearingMessageChangeTimestamp,
    });
  }

  public dataProto(): SignalService.DataMessage {
    const data = new SignalService.DataMessage();

    data.flags = SignalService.DataMessage.Flags.EXPIRATION_TIMER_UPDATE;

    // FIXME we shouldn't need this once android recieving refactor is done.
    // the envelope stores the groupId for a closed group already.
    if (this.groupId) {
      const groupMessage = new SignalService.GroupContext();
      const groupIdWithPrefix = PubKey.addTextSecurePrefixIfNeeded(this.groupId.key);
      const encoded = StringUtils.encode(groupIdWithPrefix, 'utf8');
      const id = new Uint8Array(encoded);
      groupMessage.id = id;
      groupMessage.type = SignalService.GroupContext.Type.DELIVER;

      data.group = groupMessage;
    }

    if (this.syncTarget) {
      data.syncTarget = this.syncTarget;
    }

    // TODO legacy messages support will be removed in a future release
    if (this.expirationType === 'legacy' && this.expireTimer) {
      data.expireTimer = this.expireTimer;
    }

    return data;
  }
}
