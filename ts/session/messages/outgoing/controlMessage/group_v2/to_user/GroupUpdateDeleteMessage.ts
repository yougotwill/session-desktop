import { SignalService } from '../../../../../../protobuf';
import { GroupUpdateMessage, GroupUpdateMessageParams } from '../GroupUpdateMessage';

interface Params extends GroupUpdateMessageParams {
  adminSignature: Uint8Array; // this is a signature of `"DELETE" || sessionId || timestamp `
}

/**
 * GroupUpdateDeleteMessage is sent as a 1o1 message to the recipient, not through the group's swarm.
 */
export class GroupUpdateDeleteMessage extends GroupUpdateMessage {
  public readonly adminSignature: Params['adminSignature'];

  constructor(params: Params) {
    super(params);

    this.adminSignature = params.adminSignature;
  }

  public dataProto(): SignalService.DataMessage {
    const deleteMessage = new SignalService.GroupUpdateDeleteMessage({
      groupSessionId: this.groupPk,
      adminSignature: this.adminSignature,
    });

    return new SignalService.DataMessage({ groupUpdateMessage: { deleteMessage } });
  }

  public isForGroupSwarm(): boolean {
    return false;
  }
  public isFor1o1Swarm(): boolean {
    return true;
  }
}
