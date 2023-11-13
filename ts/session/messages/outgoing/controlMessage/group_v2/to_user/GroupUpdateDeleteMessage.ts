import { SignalService } from '../../../../../../protobuf';
import { Preconditions } from '../../../preconditions';
import { GroupUpdateMessage, GroupUpdateMessageParams } from '../GroupUpdateMessage';

interface Params extends GroupUpdateMessageParams {
  adminSignature: Uint8Array; // this is a signature of `"DELETE" || sessionId || timestamp `
}

/**
 * GroupUpdateDeleteMessage is sent to the group's swarm on the `revokedRetrievableGroupMessages`
 */
export class GroupUpdateDeleteMessage extends GroupUpdateMessage {
  public readonly adminSignature: Params['adminSignature'];

  constructor(params: Params) {
    super(params);

    this.adminSignature = params.adminSignature;

    Preconditions.checkUin8tArrayOrThrow({
      data: this.adminSignature,
      expectedLength: 64,
      varName: 'adminSignature',
      context: this.constructor.toString(),
    });
  }

  public dataProto(): SignalService.DataMessage {
    const deleteMessage = new SignalService.GroupUpdateDeleteMessage({
      adminSignature: this.adminSignature,
    });
    throw new Error('Not implemented');

    return new SignalService.DataMessage({ groupUpdateMessage: { deleteMessage } });
  }

  public isForGroupSwarm(): boolean {
    return false;
  }
  public isFor1o1Swarm(): boolean {
    return true;
  }
}
