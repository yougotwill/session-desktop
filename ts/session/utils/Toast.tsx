import { toast } from 'react-toastify';
import { SessionToast, SessionToastType } from '../../components/basic/SessionToast';
import { SessionIconType } from '../../components/icon';
import { SessionSettingCategory } from '../../components/settings/SessionSettings';
import { SectionType, showLeftPaneSection, showSettingsSection } from '../../state/ducks/section';

// if you push a toast manually with toast...() be sure to set the type attribute of the SessionToast component
function pushToastError(id: string, title: string, description?: string) {
  toast.error(
    <SessionToast title={title} description={description} type={SessionToastType.Error} />,
    { toastId: id, updateId: id }
  );
}

function pushToastWarning(id: string, title: string, description?: string) {
  toast.warning(
    <SessionToast title={title} description={description} type={SessionToastType.Warning} />,
    { toastId: id, updateId: id }
  );
}

function pushToastInfo(
  id: string,
  title: string,
  description?: string,
  onToastClick?: () => void,
  delay?: number
) {
  toast.info(
    <SessionToast
      title={title}
      description={description}
      type={SessionToastType.Info}
      onToastClick={onToastClick}
    />,
    { toastId: id, updateId: id, delay }
  );
}

function pushToastSuccess(id: string, title: string, description?: string, icon?: SessionIconType) {
  toast.success(
    <SessionToast
      title={title}
      description={description}
      type={SessionToastType.Success}
      icon={icon}
    />,
    { toastId: id, updateId: id }
  );
}

function pushLoadAttachmentFailure(message?: string) {
  if (message) {
    ToastUtils.pushToastError(
      'unableToLoadAttachment',
      `${window.i18n('unableToLoadAttachment')} ${message}`
    );
  } else {
    ToastUtils.pushToastError('unableToLoadAttachment', window.i18n('unableToLoadAttachment'));
  }
}

function pushFileSizeError(limit: number, units: string) {
  ToastUtils.pushToastError(
    'fileSizeWarning',
    window.i18n('fileSizeWarning'),
    `Max size: ${limit} ${units}`
  );
}

function pushFileSizeErrorAsByte(bytesCount: number) {
  const units = ['kB', 'MB', 'GB'];
  let u = -1;
  let limit = bytesCount;
  do {
    limit /= 1000;
    u += 1;
  } while (limit >= 1000 && u < units.length - 1);
  pushFileSizeError(limit, units[u]);
}

function pushMultipleNonImageError() {
  ToastUtils.pushToastError(
    'cannotMixImageAndNonImageAttachments',
    window.i18n('cannotMixImageAndNonImageAttachments')
  );
}

function pushCannotMixError() {
  ToastUtils.pushToastError('oneNonImageAtATimeToast', window.i18n('oneNonImageAtATimeToast'));
}

function pushMaximumAttachmentsError() {
  ToastUtils.pushToastError('maximumAttachments', window.i18n('maximumAttachments'));
}

function pushMessageBodyMissing() {
  ToastUtils.pushToastError('messageBodyMissing', window.i18n('messageBodyMissing'));
}

function pushCopiedToClipBoard() {
  ToastUtils.pushToastInfo('copiedToClipboard', window.i18n('copiedToClipboard'));
}

function pushRestartNeeded() {
  ToastUtils.pushToastInfo('restartNeeded', window.i18n('spellCheckDirty'));
}

function pushAlreadyMemberOpenGroup() {
  ToastUtils.pushToastInfo('publicChatExists', window.i18n('publicChatExists'));
}

function pushUserBanSuccess() {
  ToastUtils.pushToastSuccess('userBanned', window.i18n('userBanned'));
}

function pushUserBanFailure() {
  ToastUtils.pushToastError('userBanFailed', window.i18n('userBanFailed'));
}

function pushUserUnbanSuccess() {
  ToastUtils.pushToastSuccess('userUnbanned', window.i18n('userUnbanned'));
}

function pushUserUnbanFailure() {
  ToastUtils.pushToastError('userUnbanFailed', window.i18n('userUnbanFailed'));
}

function pushMessageDeleteForbidden() {
  ToastUtils.pushToastError('messageDeletionForbidden', window.i18n('messageDeletionForbidden'));
}

function pushUnableToCall() {
  ToastUtils.pushToastError(
    'unableToCall',
    window.i18n('unableToCallTitle'),
    window.i18n('unableToCall')
  );
}

function pushedMissedCall(conversationName: string) {
  ToastUtils.pushToastInfo(
    'missedCall',
    window.i18n('callMissedTitle'),
    window.i18n('callMissed', [conversationName])
  );
}

const openPermissionsSettings = () => {
  window.inboxStore?.dispatch(showLeftPaneSection(SectionType.Settings));
  window.inboxStore?.dispatch(showSettingsSection(SessionSettingCategory.Permissions));
};

function pushedMissedCallCauseOfPermission(conversationName: string) {
  const id = 'missedCallPermission';
  toast.info(
    <SessionToast
      title={window.i18n('callMissedTitle')}
      description={window.i18n('callMissedCausePermission', [conversationName])}
      type={SessionToastType.Info}
      onToastClick={openPermissionsSettings}
    />,
    { toastId: id, updateId: id, autoClose: 10000 }
  );
}

function pushedMissedCallNotApproved(displayName: string) {
  ToastUtils.pushToastInfo(
    'missedCall',
    window.i18n('callMissedTitle'),
    window.i18n('callMissedNotApproved', [displayName])
  );
}

function pushVideoCallPermissionNeeded() {
  ToastUtils.pushToastInfo(
    'videoCallPermissionNeeded',
    window.i18n('cameraPermissionNeededTitle'),
    window.i18n('cameraPermissionNeeded'),
    openPermissionsSettings
  );
}

function pushAudioPermissionNeeded() {
  ToastUtils.pushToastInfo(
    'audioPermissionNeeded',
    window.i18n('audioPermissionNeededTitle'),
    window.i18n('audioPermissionNeeded'),
    openPermissionsSettings
  );
}

function pushOriginalNotFound() {
  ToastUtils.pushToastError('originalMessageNotFound', window.i18n('originalMessageNotFound'));
}

function pushTooManyMembers() {
  ToastUtils.pushToastError('tooManyMembers', window.i18n('closedGroupMaxSize'));
}

function pushMessageRequestPending() {
  ToastUtils.pushToastInfo('messageRequestPending', window.i18n('messageRequestPending'));
}

function pushUnblockToSend() {
  ToastUtils.pushToastInfo('unblockToSend', window.i18n('unblockToSend'));
}

function pushYouLeftTheGroup() {
  ToastUtils.pushToastError('youLeftTheGroup', window.i18n('youLeftTheGroup'));
}

function someDeletionsFailed() {
  ToastUtils.pushToastWarning('deletionError', 'Deletion error');
}

function pushDeleted(messageCount: number) {
  ToastUtils.pushToastSuccess(
    'deleted',
    window.i18n('deleted', [messageCount.toString()]),
    undefined,
    'check'
  );
}

function pushCannotRemoveCreatorFromGroup() {
  ToastUtils.pushToastWarning(
    'cannotRemoveCreatorFromGroup',
    window.i18n('cannotRemoveCreatorFromGroup'),
    window.i18n('cannotRemoveCreatorFromGroupDesc')
  );
}

function pushOnlyAdminCanRemove() {
  ToastUtils.pushToastInfo(
    'onlyAdminCanRemoveMembers',
    window.i18n('onlyAdminCanRemoveMembers'),
    window.i18n('onlyAdminCanRemoveMembersDesc')
  );
}

function pushFailedToAddAsModerator() {
  ToastUtils.pushToastWarning('failedToAddAsModerator', window.i18n('failedToAddAsModerator'));
}

function pushFailedToRemoveFromModerator() {
  ToastUtils.pushToastWarning(
    'failedToRemoveFromModerator',
    window.i18n('failedToRemoveFromModerator')
  );
}

function pushUserAddedToModerators() {
  ToastUtils.pushToastSuccess('userAddedToModerators', window.i18n('userAddedToModerators'));
}

function pushUserRemovedFromModerators() {
  ToastUtils.pushToastSuccess(
    'userRemovedFromModerators',
    window.i18n('userRemovedFromModerators')
  );
}

function pushInvalidPubKey() {
  ToastUtils.pushToastSuccess('invalidPubKey', window.i18n('invalidPubkeyFormat'));
}

function pushNoCameraFound() {
  ToastUtils.pushToastWarning('noCameraFound', window.i18n('noCameraFound'));
}

function pushNoAudioInputFound() {
  ToastUtils.pushToastWarning('noAudioInputFound', window.i18n('noAudioInputFound'));
}

function pushNoAudioOutputFound() {
  ToastUtils.pushToastWarning('noAudioOutputFound', window.i18n('noAudioOutputFound'));
}

function pushNoMediaUntilApproved() {
  ToastUtils.pushToastError('noMediaUntilApproved', window.i18n('noMediaUntilApproved'));
}

function pushMustBeApproved() {
  ToastUtils.pushToastError('mustBeApproved', window.i18n('mustBeApproved'));
}

function pushRateLimitHitReactions() {
  ToastUtils.pushToastInfo('reactRateLimit', '', window?.i18n?.('rateLimitReactMessage')); // because otherwise test fails
}

// export an object for testing purposes as we need to stub some of the methods
export const ToastUtils = {
  pushToastError,
  pushToastWarning,
  pushToastInfo,
  pushToastSuccess,
  pushLoadAttachmentFailure,
  pushFileSizeError,
  pushFileSizeErrorAsByte,
  pushMultipleNonImageError,
  pushCannotMixError,
  pushMaximumAttachmentsError,
  pushMessageBodyMissing,
  pushCopiedToClipBoard,
  pushRestartNeeded,
  pushAlreadyMemberOpenGroup,
  pushUserBanSuccess,
  pushUserBanFailure,
  pushUserUnbanSuccess,
  pushUserUnbanFailure,
  pushMessageDeleteForbidden,
  pushUnableToCall,
  pushedMissedCall,
  pushedMissedCallCauseOfPermission,
  pushedMissedCallNotApproved,
  pushVideoCallPermissionNeeded,
  pushAudioPermissionNeeded,
  pushOriginalNotFound,
  pushTooManyMembers,
  pushMessageRequestPending,
  pushUnblockToSend,
  pushYouLeftTheGroup,
  someDeletionsFailed,
  pushDeleted,
  pushCannotRemoveCreatorFromGroup,
  pushOnlyAdminCanRemove,
  pushFailedToAddAsModerator,
  pushFailedToRemoveFromModerator,
  pushUserAddedToModerators,
  pushUserRemovedFromModerators,
  pushInvalidPubKey,
  pushNoCameraFound,
  pushNoAudioInputFound,
  pushNoAudioOutputFound,
  pushNoMediaUntilApproved,
  pushMustBeApproved,
  pushRateLimitHitReactions,
};
