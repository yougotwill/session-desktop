import { isEmpty, isFinite } from 'lodash';
import { SignalService } from '../../../../../../protobuf';
import { GroupUpdateMessage, GroupUpdateMessageParams } from '../GroupUpdateMessage';

type NameChangeParams = GroupUpdateMessageParams & {
  typeOfChange: SignalService.GroupUpdateInfoChangeMessage.Type.NAME;
  updatedName: string;
};

type AvatarChangeParams = GroupUpdateMessageParams & {
  typeOfChange: SignalService.GroupUpdateInfoChangeMessage.Type.AVATAR;
};

type DisappearingMessageChangeParams = GroupUpdateMessageParams & {
  typeOfChange: SignalService.GroupUpdateInfoChangeMessage.Type.DISAPPEARING_MESSAGES;
  updatedExpirationSeconds: number;
};

/**
 * GroupUpdateInfoChangeMessage is sent as a message to group's swarm.
 */
export class GroupUpdateInfoChangeMessage extends GroupUpdateMessage {
  public readonly typeOfChange: SignalService.GroupUpdateInfoChangeMessage.Type;
  public readonly updatedName: string = '';
  public readonly updatedExpirationSeconds: number = 0;

  constructor(params: NameChangeParams | AvatarChangeParams | DisappearingMessageChangeParams) {
    super(params);
    const types = SignalService.GroupUpdateInfoChangeMessage.Type;

    this.typeOfChange = params.typeOfChange;

    switch (params.typeOfChange) {
      case types.NAME: {
        if (isEmpty(params.updatedName)) {
          throw new Error('A group needs a name');
        }
        this.updatedName = params.updatedName;
        break;
      }
      case types.AVATAR:
        // nothing to do for avatar
        break;
      case types.DISAPPEARING_MESSAGES: {
        if (!isFinite(params.updatedExpirationSeconds) || params.updatedExpirationSeconds < 0) {
          throw new Error('Invalid disappearing message timer. Must be finite and >=0');
        }
        this.updatedExpirationSeconds = params.updatedExpirationSeconds;
        break;
      }
      default:
        break;
    }
  }

  protected updateProto(): SignalService.GroupUpdateMessage {
    const infoChangeMessage = new SignalService.GroupUpdateInfoChangeMessage({
      type: this.typeOfChange,
    });

    if (this.typeOfChange === SignalService.GroupUpdateInfoChangeMessage.Type.NAME) {
      infoChangeMessage.updatedName = this.updatedName;
    }
    if (
      this.typeOfChange === SignalService.GroupUpdateInfoChangeMessage.Type.DISAPPEARING_MESSAGES
    ) {
      infoChangeMessage.updatedExpiration = this.updatedExpirationSeconds;
    }

    return new SignalService.GroupUpdateMessage({
      infoChangeMessage,
    });
  }

  public isForGroupSwarm(): boolean {
    return true;
  }
  public isFor1o1Swarm(): boolean {
    return false;
  }
}
