import { GroupPubkeyType } from 'libsession_util_nodejs';
import { SignalService } from '../../../../../protobuf';
import { LibSodiumWrappers } from '../../../../crypto';
import { ExpirableMessage, ExpirableMessageParams } from '../../ExpirableMessage';

export type AdminSigDetails = {
  secretKey: Uint8Array;
  sodium: LibSodiumWrappers;
};

export interface GroupUpdateMessageParams extends ExpirableMessageParams {
  groupPk: GroupPubkeyType;
}

export abstract class GroupUpdateMessage extends ExpirableMessage {
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
