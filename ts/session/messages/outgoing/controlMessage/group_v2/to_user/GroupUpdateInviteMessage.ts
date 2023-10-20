import { SignalService } from '../../../../../../protobuf';
import { UserUtils } from '../../../../../utils';
import { GroupUpdateMessage, GroupUpdateMessageParams } from '../GroupUpdateMessage';

interface Params extends GroupUpdateMessageParams {
  groupName: string;
  adminSignature: Uint8Array; // this is a signature of `"INVITE" || inviteeSessionId || timestamp`
  memberAuthData: Uint8Array;
}

/**
 * GroupUpdateInviteMessage is sent as a 1o1 message to the recipient, not through the group's swarm.
 */
export class GroupUpdateInviteMessage extends GroupUpdateMessage {
  public readonly groupName: Params['groupName'];
  public readonly adminSignature: Params['adminSignature'];
  public readonly memberAuthData: Params['memberAuthData'];

  constructor(params: Params) {
    super({
      timestamp: params.timestamp,
      identifier: params.identifier,
      groupPk: params.groupPk,
    });

    this.groupName = params.groupName;
    this.adminSignature = params.adminSignature;
    this.memberAuthData = params.memberAuthData;
  }

  protected updateProto(): SignalService.GroupUpdateMessage {
    const ourProfile = UserUtils.getOurProfile();
    const inviteMessage = new SignalService.GroupUpdateInviteMessage({
      groupSessionId: this.groupPk,
      name: this.groupName,
      adminSignature: this.adminSignature,
      memberAuthData: this.memberAuthData,
      profile: ourProfile
        ? { displayName: ourProfile.displayName, profilePicture: ourProfile.avatarPointer }
        : undefined,
      profileKey: ourProfile?.profileKey,
    });
    return new SignalService.GroupUpdateMessage({ inviteMessage });
  }

  public isForGroupSwarm(): boolean {
    return false;
  }

  public isFor1o1Swarm(): boolean {
    return true;
  }
}
