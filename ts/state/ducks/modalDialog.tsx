import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { BlockOrUnblockModalState } from '../../components/dialog/blockOrUnblock/BlockOrUnblockModalState';
import { EnterPasswordModalProps } from '../../components/dialog/EnterPasswordModal';
import { HideRecoveryPasswordDialogProps } from '../../components/dialog/HideRecoveryPasswordDialog';
import { SessionConfirmDialogProps } from '../../components/dialog/SessionConfirm';
import { MediaItemType } from '../../components/lightbox/LightboxGallery';
import { AttachmentTypeWithPath } from '../../types/Attachment';
import type { EditProfilePictureModalProps, PasswordAction } from '../../types/ReduxTypes';
import { CommandPaletteModalProps } from '../../components/CommandPalette';

export type BanType = 'ban' | 'unban';

export type ConfirmModalState = SessionConfirmDialogProps | null;
export type InviteContactModalState = { conversationId: string } | null;
export type BanOrUnbanUserModalState = {
  conversationId: string;
  banType: BanType;
  pubkey?: string;
} | null;
export type AddModeratorsModalState = InviteContactModalState;
export type RemoveModeratorsModalState = InviteContactModalState;
export type UpdateGroupMembersModalState = InviteContactModalState;
export type UpdateGroupNameModalState = InviteContactModalState;
export type ChangeNickNameModalState = InviteContactModalState;
export type EditProfileModalState = object | null;
export type OnionPathModalState = EditProfileModalState;
export type EnterPasswordModalState = EnterPasswordModalProps | null;
export type DeleteAccountModalState = EditProfileModalState;
export type OpenUrlModalState = { urlToOpen: string } | null;

export type SessionPasswordModalState = { passwordAction: PasswordAction; onOk: () => void } | null;

export type UserDetailsModalState = {
  conversationId: string;
  authorAvatarPath: string | null;
  userName: string;
} | null;

export type ReactModalsState = {
  reaction: string;
  messageId: string;
} | null;

export type EditProfilePictureModalState = EditProfilePictureModalProps | null;

export type HideRecoveryPasswordModalState = HideRecoveryPasswordDialogProps | null;

export type LightBoxOptions = {
  media: Array<MediaItemType>;
  attachment: AttachmentTypeWithPath;
  selectedIndex?: number;
  onClose?: () => void;
} | null;

export type CommandPaletteModalState = CommandPaletteModalProps | null;

export type ModalState = {
  confirmModal: ConfirmModalState;
  inviteContactModal: InviteContactModalState;
  banOrUnbanUserModal: BanOrUnbanUserModalState;
  blockOrUnblockModal: BlockOrUnblockModalState;
  removeModeratorsModal: RemoveModeratorsModalState;
  addModeratorsModal: AddModeratorsModalState;
  groupNameModal: UpdateGroupNameModalState;
  groupMembersModal: UpdateGroupMembersModalState;
  userDetailsModal: UserDetailsModalState;
  nickNameModal: ChangeNickNameModalState;
  editProfileModal: EditProfileModalState;
  onionPathModal: OnionPathModalState;
  enterPasswordModal: EnterPasswordModalState;
  sessionPasswordModal: SessionPasswordModalState;
  deleteAccountModal: DeleteAccountModalState;
  reactListModalState: ReactModalsState;
  reactClearAllModalState: ReactModalsState;
  editProfilePictureModalState: EditProfilePictureModalState;
  hideRecoveryPasswordModalState: HideRecoveryPasswordModalState;
  openUrlModal: OpenUrlModalState;
  lightBoxOptions: LightBoxOptions;
  commandPaletteModalState: CommandPaletteModalState;
};

export const initialModalState: ModalState = {
  confirmModal: null,
  inviteContactModal: null,
  addModeratorsModal: null,
  removeModeratorsModal: null,
  banOrUnbanUserModal: null,
  blockOrUnblockModal: null,
  groupNameModal: null,
  groupMembersModal: null,
  userDetailsModal: null,
  nickNameModal: null,
  editProfileModal: null,
  onionPathModal: null,
  enterPasswordModal: null,
  sessionPasswordModal: null,
  deleteAccountModal: null,
  reactListModalState: null,
  reactClearAllModalState: null,
  editProfilePictureModalState: null,
  hideRecoveryPasswordModalState: null,
  openUrlModal: null,
  lightBoxOptions: null,
  commandPaletteModalState: null,
};

const ModalSlice = createSlice({
  name: 'modals',
  initialState: initialModalState,
  reducers: {
    updateConfirmModal(state, action: PayloadAction<ConfirmModalState | null>) {
      return { ...state, confirmModal: action.payload };
    },
    updateInviteContactModal(state, action: PayloadAction<InviteContactModalState | null>) {
      return { ...state, inviteContactModal: action.payload };
    },
    updateBanOrUnbanUserModal(state, action: PayloadAction<BanOrUnbanUserModalState | null>) {
      return { ...state, banOrUnbanUserModal: action.payload };
    },
    updateBlockOrUnblockModal(state, action: PayloadAction<BlockOrUnblockModalState | null>) {
      return { ...state, blockOrUnblockModal: action.payload };
    },
    updateAddModeratorsModal(state, action: PayloadAction<AddModeratorsModalState | null>) {
      return { ...state, addModeratorsModal: action.payload };
    },
    updateRemoveModeratorsModal(state, action: PayloadAction<RemoveModeratorsModalState | null>) {
      return { ...state, removeModeratorsModal: action.payload };
    },
    updateGroupNameModal(state, action: PayloadAction<UpdateGroupNameModalState | null>) {
      return { ...state, groupNameModal: action.payload };
    },
    updateGroupMembersModal(state, action: PayloadAction<UpdateGroupMembersModalState | null>) {
      return { ...state, groupMembersModal: action.payload };
    },
    updateUserDetailsModal(state, action: PayloadAction<UserDetailsModalState | null>) {
      return { ...state, userDetailsModal: action.payload };
    },
    changeNickNameModal(state, action: PayloadAction<ChangeNickNameModalState | null>) {
      return { ...state, nickNameModal: action.payload };
    },
    editProfileModal(state, action: PayloadAction<EditProfileModalState | null>) {
      return { ...state, editProfileModal: action.payload };
    },
    onionPathModal(state, action: PayloadAction<OnionPathModalState | null>) {
      return { ...state, onionPathModal: action.payload };
    },
    updateEnterPasswordModal(state, action: PayloadAction<EnterPasswordModalState | null>) {
      return { ...state, enterPasswordModal: action.payload };
    },
    sessionPassword(state, action: PayloadAction<SessionPasswordModalState>) {
      return { ...state, sessionPasswordModal: action.payload };
    },
    updateDeleteAccountModal(state, action: PayloadAction<DeleteAccountModalState>) {
      return { ...state, deleteAccountModal: action.payload };
    },
    updateReactListModal(state, action: PayloadAction<ReactModalsState>) {
      return { ...state, reactListModalState: action.payload };
    },
    updateReactClearAllModal(state, action: PayloadAction<ReactModalsState>) {
      return { ...state, reactClearAllModalState: action.payload };
    },
    updateEditProfilePictureModal(state, action: PayloadAction<EditProfilePictureModalState>) {
      return { ...state, editProfilePictureModalState: action.payload };
    },
    updateHideRecoveryPasswordModal(state, action: PayloadAction<HideRecoveryPasswordModalState>) {
      return { ...state, hideRecoveryPasswordModalState: action.payload };
    },
    updateOpenUrlModal(state, action: PayloadAction<OpenUrlModalState>) {
      return { ...state, openUrlModal: action.payload };
    },
    updateLightBoxOptions(state, action: PayloadAction<LightBoxOptions>) {
      const lightBoxOptions = action.payload;

      if (lightBoxOptions) {
        const { media, attachment } = lightBoxOptions;

        if (attachment && media) {
          const selectedIndex =
            media.length > 1
              ? media.findIndex(mediaMessage => mediaMessage.attachment.path === attachment.path)
              : 0;
          lightBoxOptions.selectedIndex = selectedIndex;
        }
      }

      return { ...state, lightBoxOptions };
    },
    updateCommandPaletteModal(state, action: PayloadAction<CommandPaletteModalProps | null>) {
      return { ...state, commandPaletteModalState: action.payload };
    },
  },
});

export const { actions, reducer } = ModalSlice;
export const {
  updateConfirmModal,
  updateInviteContactModal,
  updateAddModeratorsModal,
  updateRemoveModeratorsModal,
  updateGroupNameModal,
  updateGroupMembersModal,
  updateUserDetailsModal,
  changeNickNameModal,
  editProfileModal,
  onionPathModal,
  updateEnterPasswordModal,
  sessionPassword,
  updateDeleteAccountModal,
  updateBanOrUnbanUserModal,
  updateBlockOrUnblockModal,
  updateReactListModal,
  updateReactClearAllModal,
  updateEditProfilePictureModal,
  updateHideRecoveryPasswordModal,
  updateOpenUrlModal,
  updateLightBoxOptions,
  updateCommandPaletteModal,
} = actions;
export const modalReducer = reducer;
