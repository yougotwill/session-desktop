import { SignalService } from '../../../../../../protobuf';
import { GroupUpdateMessage } from '../GroupUpdateMessage';

/**
 * GroupUpdateMemberLeftMessage is sent to the group's swarm.
 * Our pubkey, as the leaving member is part of the encryption of libsession for the new groups
 *
 */
export class GroupUpdateMemberLeftMessage extends GroupUpdateMessage {
  public dataProto(): SignalService.DataMessage {
    const memberLeftMessage = new SignalService.GroupUpdateMemberLeftMessage({});

    return new SignalService.DataMessage({ groupUpdateMessage: { memberLeftMessage } });
  }

  public isForGroupSwarm(): boolean {
    return true;
  }
  public isFor1o1Swarm(): boolean {
    return false;
  }
}
