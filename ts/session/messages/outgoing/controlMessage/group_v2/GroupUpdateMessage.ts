import { GroupPubkeyType } from 'libsession_util_nodejs';
import { SignalService } from '../../../../../protobuf';
import { LibSodiumWrappers } from '../../../../crypto';
import { DataMessage } from '../../DataMessage';
import { MessageParams } from '../../Message';

export type AdminSigDetails = {
  secretKey: Uint8Array;
  sodium: LibSodiumWrappers;
};

export interface GroupUpdateMessageParams extends MessageParams {
  groupPk: GroupPubkeyType;
}

export abstract class GroupUpdateMessage extends DataMessage {
  public readonly destination: GroupUpdateMessageParams['groupPk'];

  constructor(params: GroupUpdateMessageParams) {
    super(params);

    this.destination = params.groupPk;
    if (!this.destination || this.destination.length === 0) {
      throw new Error('destination must be set to the groupPubkey');
    }
  }

  public abstract dataProto(): SignalService.DataMessage;

  public abstract isFor1o1Swarm(): boolean;
  public abstract isForGroupSwarm(): boolean;
}
