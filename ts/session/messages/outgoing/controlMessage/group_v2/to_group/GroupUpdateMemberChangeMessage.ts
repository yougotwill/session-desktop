import { PubkeyType } from 'libsession_util_nodejs';
import { isEmpty } from 'lodash';
import { SignalService } from '../../../../../../protobuf';
import { assertUnreachable } from '../../../../../../types/sqlSharedTypes';
import { SnodeNamespaces } from '../../../../../apis/snode_api/namespaces';
import { LibSodiumWrappers } from '../../../../../crypto';
import { stringToUint8Array } from '../../../../../utils/String';
import {
  AdminSigDetails,
  GroupUpdateMessage,
  GroupUpdateMessageParams,
} from '../GroupUpdateMessage';

type MembersAddedMessageParams = GroupUpdateMessageParams & {
  typeOfChange: SignalService.GroupUpdateMemberChangeMessage.Type.ADDED;
  added: Array<PubkeyType>;
};

type MembersRemovedMessageParams = GroupUpdateMessageParams & {
  typeOfChange: SignalService.GroupUpdateMemberChangeMessage.Type.REMOVED;
  removed: Array<PubkeyType>;
};

type MembersPromotedMessageParams = GroupUpdateMessageParams & {
  typeOfChange: SignalService.GroupUpdateMemberChangeMessage.Type.PROMOTED;
  promoted: Array<PubkeyType>;
};

/**
 * GroupUpdateInfoChangeMessage is sent to the group's swarm.
 */
export class GroupUpdateMemberChangeMessage extends GroupUpdateMessage {
  public readonly typeOfChange: SignalService.GroupUpdateMemberChangeMessage.Type;
  public readonly memberSessionIds: Array<PubkeyType> = []; // added, removed, promoted based on the type.
  public readonly namespace = SnodeNamespaces.ClosedGroupMessages;
  private readonly secretKey: Uint8Array; // not sent, only used for signing content as part of the message
  private readonly sodium: LibSodiumWrappers;

  constructor(
    params: (
      | MembersAddedMessageParams
      | MembersRemovedMessageParams
      | MembersPromotedMessageParams
    ) &
      AdminSigDetails
  ) {
    super(params);
    const { Type } = SignalService.GroupUpdateMemberChangeMessage;
    const { typeOfChange } = params;

    this.typeOfChange = typeOfChange;
    this.secretKey = params.secretKey;
    this.sodium = params.sodium;

    switch (typeOfChange) {
      case Type.ADDED: {
        if (isEmpty(params.added)) {
          throw new Error('added members list cannot be empty');
        }
        this.memberSessionIds = params.added;
        break;
      }
      case Type.REMOVED: {
        if (isEmpty(params.removed)) {
          throw new Error('removed members list cannot be empty');
        }
        this.memberSessionIds = params.removed;
        break;
      }
      case Type.PROMOTED: {
        if (isEmpty(params.promoted)) {
          throw new Error('promoted members list cannot be empty');
        }
        this.memberSessionIds = params.promoted;
        break;
      }
      default:
        assertUnreachable(typeOfChange, 'unhandled switch case');
    }
  }

  public dataProto(): SignalService.DataMessage {
    const memberChangeMessage = new SignalService.GroupUpdateMemberChangeMessage({
      type: this.typeOfChange,
      memberSessionIds: this.memberSessionIds,
      adminSignature: this.sodium.crypto_sign_detached(
        stringToUint8Array(`MEMBER_CHANGE${this.typeOfChange}${this.timestamp}`),
        this.secretKey
      ),
    });

    return new SignalService.DataMessage({ groupUpdateMessage: { memberChangeMessage } });
  }

  public isForGroupSwarm(): boolean {
    return true;
  }
  public isFor1o1Swarm(): boolean {
    return false;
  }
}
