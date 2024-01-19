import { PubkeyType } from 'libsession_util_nodejs';
import { SignalService } from '../../../../../../protobuf';
import { SnodeNamespaces } from '../../../../../apis/snode_api/namespaces';
import { Preconditions } from '../../../preconditions';
import { GroupUpdateMessage, GroupUpdateMessageParams } from '../GroupUpdateMessage';

interface Params extends GroupUpdateMessageParams {
  adminSignature: Uint8Array; // this is a signature of `"DELETE" || sessionId || timestamp`
  memberSessionIds: Array<PubkeyType>;
}

/**
 * GroupUpdateDeleteMessage is sent to the group's swarm on the `revokedRetrievableGroupMessages` namespace
 */
export class GroupUpdateDeleteMessage extends GroupUpdateMessage {
  public readonly namespace = SnodeNamespaces.ClosedGroupRevokedRetrievableMessages;
  public readonly adminSignature: Params['adminSignature'];
  public readonly memberSessionIds: Params['memberSessionIds'];

  constructor(params: Params) {
    super(params);

    this.adminSignature = params.adminSignature;
    this.memberSessionIds = params.memberSessionIds;

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
      memberSessionIds: this.memberSessionIds,
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
