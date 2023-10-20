import { GroupPubkeyType } from 'libsession_util_nodejs';
import { SignalService } from '../../../../../protobuf';
import { DataMessage } from '../../DataMessage';
import { MessageParams } from '../../Message';

export interface GroupUpdateMessageParams extends MessageParams {
  groupPk: GroupPubkeyType;
}

export abstract class GroupUpdateMessage extends DataMessage {
  public readonly groupPk: GroupUpdateMessageParams['groupPk'];

  constructor(params: GroupUpdateMessageParams) {
    super(params);

    this.groupPk = params.groupPk;
    if (!this.groupPk || this.groupPk.length === 0) {
      throw new Error('groupPk must be set');
    }
  }

  protected abstract updateProto(): SignalService.GroupUpdateMessage;

  public dataProto(): SignalService.DataMessage {
    const groupUpdateMessage = this.updateProto();
    return new SignalService.DataMessage({ groupUpdateMessage });
  }

  public abstract isFor1o1Swarm(): boolean;
  public abstract isForGroupSwarm(): boolean;
}
