import { useSelector } from 'react-redux';
import {
  getAddModeratorsModal,
  getBanOrUnbanUserModalState,
  getBlockOrUnblockUserModalState,
  getChangeNickNameDialog,
  getCommandPaletteModalState,
  getConfirmModal,
  getDeleteAccountModalState,
  getEditProfileDialog,
  getEditProfilePictureModalState,
  getEnterPasswordModalState,
  getHideRecoveryPasswordModalState,
  getInviteContactModal,
  getLightBoxOptions,
  getOnionPathDialog,
  getOpenUrlModalState,
  getReactClearAllDialog,
  getReactListDialog,
  getRemoveModeratorsModal,
  getSessionPasswordDialog,
  getUpdateGroupMembersModal,
  getUpdateGroupNameModal,
  getUserDetailsModal,
} from '../../state/selectors/modal';
import { LightboxGallery } from '../lightbox/LightboxGallery';
import { BanOrUnBanUserDialog } from './BanOrUnbanUserDialog';
import { DeleteAccountModal } from './DeleteAccountModal';
import { EditProfilePictureModal } from './EditProfilePictureModal';
import { EnterPasswordModal } from './EnterPasswordModal';
import { HideRecoveryPasswordDialog } from './HideRecoveryPasswordDialog';
import { InviteContactsDialog } from './InviteContactsDialog';
import { AddModeratorsDialog } from './ModeratorsAddDialog';
import { RemoveModeratorsDialog } from './ModeratorsRemoveDialog';
import { OnionPathModal } from './OnionStatusPathDialog';
import { ReactClearAllModal } from './ReactClearAllModal';
import { ReactListModal } from './ReactListModal';
import { SessionConfirm } from './SessionConfirm';
import { SessionNicknameDialog } from './SessionNicknameDialog';
import { SessionSetPasswordDialog } from './SessionSetPasswordDialog';
import { UpdateGroupMembersDialog } from './UpdateGroupMembersDialog';
import { UpdateGroupNameDialog } from './UpdateGroupNameDialog';
import { UserDetailsDialog } from './UserDetailsDialog';
import { EditProfileDialog } from './edit-profile/EditProfileDialog';
import { OpenUrlModal } from './OpenUrlModal';
import { BlockOrUnblockDialog } from './blockOrUnblock/BlockOrUnblockDialog';
import { CommandPalette } from '../CommandPalette';

export const ModalContainer = () => {
  const confirmModalState = useSelector(getConfirmModal);
  const inviteModalState = useSelector(getInviteContactModal);
  const addModeratorsModalState = useSelector(getAddModeratorsModal);
  const removeModeratorsModalState = useSelector(getRemoveModeratorsModal);
  const updateGroupMembersModalState = useSelector(getUpdateGroupMembersModal);
  const updateGroupNameModalState = useSelector(getUpdateGroupNameModal);
  const userDetailsModalState = useSelector(getUserDetailsModal);
  const changeNicknameModal = useSelector(getChangeNickNameDialog);
  const editProfileModalState = useSelector(getEditProfileDialog);
  const onionPathModalState = useSelector(getOnionPathDialog);
  const enterPasswordModalState = useSelector(getEnterPasswordModalState);
  const sessionPasswordModalState = useSelector(getSessionPasswordDialog);
  const deleteAccountModalState = useSelector(getDeleteAccountModalState);
  const banOrUnbanUserModalState = useSelector(getBanOrUnbanUserModalState);
  const blockOrUnblockModalState = useSelector(getBlockOrUnblockUserModalState);
  const reactListModalState = useSelector(getReactListDialog);
  const reactClearAllModalState = useSelector(getReactClearAllDialog);
  const editProfilePictureModalState = useSelector(getEditProfilePictureModalState);
  const hideRecoveryPasswordModalState = useSelector(getHideRecoveryPasswordModalState);
  const openUrlModalState = useSelector(getOpenUrlModalState);
  const lightBoxOptions = useSelector(getLightBoxOptions);
  const commandPaletteModalState = useSelector(getCommandPaletteModalState);

  return (
    <>
      {banOrUnbanUserModalState && <BanOrUnBanUserDialog {...banOrUnbanUserModalState} />}
      {blockOrUnblockModalState && <BlockOrUnblockDialog {...blockOrUnblockModalState} />}
      {inviteModalState && <InviteContactsDialog {...inviteModalState} />}
      {addModeratorsModalState && <AddModeratorsDialog {...addModeratorsModalState} />}
      {removeModeratorsModalState && <RemoveModeratorsDialog {...removeModeratorsModalState} />}
      {updateGroupMembersModalState && (
        <UpdateGroupMembersDialog {...updateGroupMembersModalState} />
      )}
      {updateGroupNameModalState && <UpdateGroupNameDialog {...updateGroupNameModalState} />}
      {userDetailsModalState && <UserDetailsDialog {...userDetailsModalState} />}
      {changeNicknameModal && <SessionNicknameDialog {...changeNicknameModal} />}
      {editProfileModalState && <EditProfileDialog {...editProfileModalState} />}
      {onionPathModalState && <OnionPathModal {...onionPathModalState} />}
      {enterPasswordModalState && <EnterPasswordModal {...enterPasswordModalState} />}
      {sessionPasswordModalState && <SessionSetPasswordDialog {...sessionPasswordModalState} />}
      {deleteAccountModalState && <DeleteAccountModal {...deleteAccountModalState} />}
      {confirmModalState && <SessionConfirm {...confirmModalState} />}
      {reactListModalState && <ReactListModal {...reactListModalState} />}
      {reactClearAllModalState && <ReactClearAllModal {...reactClearAllModalState} />}
      {editProfilePictureModalState && (
        <EditProfilePictureModal {...editProfilePictureModalState} />
      )}
      {hideRecoveryPasswordModalState && (
        <HideRecoveryPasswordDialog {...hideRecoveryPasswordModalState} />
      )}
      {openUrlModalState && <OpenUrlModal {...openUrlModalState} />}
      {lightBoxOptions && <LightboxGallery {...lightBoxOptions} />}
      {commandPaletteModalState && <CommandPalette {...commandPaletteModalState} />}
    </>
  );
};
