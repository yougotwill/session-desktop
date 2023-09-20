import { GroupPubkeyType } from 'libsession_util_nodejs';
import { SignalService } from '../../../../protobuf';
import { PubKey } from '../../../types';
import { StringUtils } from '../../../utils';
import { VisibleMessage } from './VisibleMessage';
import { ClosedGroupMessage } from '../controlMessage/group/ClosedGroupMessage';
import { DataMessage } from '../DataMessage';
import { SnodeNamespaces } from '../../../apis/snode_api/namespaces';

interface ClosedGroupVisibleMessageParams {
  identifier?: string;
  groupId: string;
  chatMessage: VisibleMessage;
}

export class ClosedGroupVisibleMessage extends ClosedGroupMessage {
  private readonly chatMessage: VisibleMessage;

  constructor(params: ClosedGroupVisibleMessageParams) {
    super({
      timestamp: params.chatMessage.timestamp,
      identifier: params.identifier ?? params.chatMessage.identifier,
      groupId: params.groupId,
    });
    this.chatMessage = params.chatMessage;
    if (!params.groupId) {
      throw new Error('ClosedGroupVisibleMessage: groupId must be set');
    }

    if (PubKey.isClosedGroupV2(PubKey.cast(params.groupId).key)) {
      throw new Error('GroupContext should not be used anymore with closed group v3');
    }
  }
  public dataProto(): SignalService.DataMessage {
    // expireTimer is set in the dataProto in this call directly
    const dataProto = this.chatMessage.dataProto();

    const groupMessage = new SignalService.GroupContext();

    const groupIdWithPrefix = PubKey.addTextSecurePrefixIfNeeded(this.groupId.key);
    const encoded = StringUtils.encode(groupIdWithPrefix, 'utf8');
    const id = new Uint8Array(encoded);
    groupMessage.id = id;
    groupMessage.type = SignalService.GroupContext.Type.DELIVER;

    dataProto.group = groupMessage;

    return dataProto;
  }
}

type WithDestinationGroupPk = { destination: GroupPubkeyType };
type WithGroupMessageNamespace = { namespace: SnodeNamespaces.ClosedGroupMessages };

export class ClosedGroupV3VisibleMessage extends DataMessage {
  private readonly chatMessage: VisibleMessage;
  public readonly destination: GroupPubkeyType;
  public readonly namespace: SnodeNamespaces.ClosedGroupMessages;

  constructor(
    params: Pick<ClosedGroupVisibleMessageParams, 'chatMessage' | 'identifier'> &
      WithDestinationGroupPk &
      WithGroupMessageNamespace
  ) {
    super({
      timestamp: params.chatMessage.timestamp,
      identifier: params.identifier ?? params.chatMessage.identifier,
    });
    this.chatMessage = params.chatMessage;

    if (!PubKey.isClosedGroupV2(params.destination)) {
      throw new Error('ClosedGroupV3VisibleMessage only work with 03-groups destination');
    }
    this.destination = params.destination;
    this.namespace = params.namespace;
  }

  public dataProto(): SignalService.DataMessage {
    // expireTimer is set in the dataProto in this call directly
    const dataProto = this.chatMessage.dataProto();
    return dataProto;
  }
}
