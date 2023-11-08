import { PubkeyType } from 'libsession_util_nodejs';
import { isEmpty } from 'lodash';
import { SignalService } from '../../../../../../protobuf';
import { SnodeNamespaces } from '../../../../../apis/snode_api/namespaces';
import { Preconditions } from '../../../preconditions';
import { GroupUpdateMessage, GroupUpdateMessageParams } from '../GroupUpdateMessage';

type Params = GroupUpdateMessageParams & {
  memberSessionIds: Array<PubkeyType>;
  adminSignature: Uint8Array; // this is a signature of `"DELETE_CONTENT" || timestamp || sessionId[0] || ... || sessionId[N]`
};

/**
 * GroupUpdateDeleteMemberContentMessage is sent as a message to group's swarm.
 */
export class GroupUpdateDeleteMemberContentMessage extends GroupUpdateMessage {
  public readonly memberSessionIds: Params['memberSessionIds'];
  public readonly adminSignature: Params['adminSignature'];
  public readonly namespace = SnodeNamespaces.ClosedGroupMessages;

  constructor(params: Params) {
    super(params);

    this.adminSignature = params.adminSignature;
    this.memberSessionIds = params.memberSessionIds;
    if (isEmpty(this.memberSessionIds)) {
      throw new Error('GroupUpdateDeleteMemberContentMessage needs members in list');
    }
    Preconditions.checkUin8tArrayOrThrow({
      data: this.adminSignature,
      expectedLength: 64,
      varName: 'adminSignature',
      context: this.constructor.toString(),
    });

    Preconditions.checkArrayHaveOnly05Pubkeys({
      arr: this.memberSessionIds,
      context: this.constructor.toString(),
      varName: 'memberSessionIds',
    });
  }

  public dataProto(): SignalService.DataMessage {
    const deleteMemberContent = new SignalService.GroupUpdateDeleteMemberContentMessage({
      adminSignature: this.adminSignature,
      memberSessionIds: this.memberSessionIds,
    });

    return new SignalService.DataMessage({ groupUpdateMessage: { deleteMemberContent } });
  }

  public isForGroupSwarm(): boolean {
    return true;
  }
  public isFor1o1Swarm(): boolean {
    return false;
  }
}
