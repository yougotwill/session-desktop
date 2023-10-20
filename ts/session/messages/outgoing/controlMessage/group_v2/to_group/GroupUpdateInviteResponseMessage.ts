import { SignalService } from '../../../../../../protobuf';
import { getOurProfile } from '../../../../../utils/User';
import { GroupUpdateMessage, GroupUpdateMessageParams } from '../GroupUpdateMessage';

type Params = GroupUpdateMessageParams & {
  isApproved: boolean;
};

/**
 * GroupUpdateInviteResponseMessage is sent to the group's swarm.
 * Our pubkey, as the leaving member is part of the encryption of libsession for the new groups
 *
 */
export class GroupUpdateInviteResponseMessage extends GroupUpdateMessage {
  public readonly isApproved: Params['isApproved'];
  constructor(params: Params) {
    super(params);
    this.isApproved = params.isApproved;
  }

  protected updateProto(): SignalService.GroupUpdateMessage {
    const ourProfile = getOurProfile();

    const inviteResponse = new SignalService.GroupUpdateInviteResponseMessage({
      isApproved: true,
      profileKey: ourProfile?.profileKey,
      profile: ourProfile
        ? {
            displayName: ourProfile.displayName,
            profilePicture: ourProfile.avatarPointer,
          }
        : undefined,
    });

    return new SignalService.GroupUpdateMessage({
      inviteResponse,
    });
  }

  public isForGroupSwarm(): boolean {
    return true;
  }
  public isFor1o1Swarm(): boolean {
    return false;
  }
}
