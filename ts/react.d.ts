import 'react';

/**
 * WARNING: if you change something here, you will most likely break some integration tests.
 * So be sure to check with QA first.
 */

declare module 'react' {
  type SessionDataTestId =
    | 'group_member_status_text'
    | 'group_member_name'
    | 'loading-spinner'
    | 'session-toast'
    | 'loading-animation'
    | 'your-session-id'
    | 'chooser-new-community'
    | 'chooser-new-group'
    | 'chooser-new-conversation-button'
    | 'new-conversation-button'
    | 'module-conversation__user__profile-name'
    | 'message-request-banner'
    | 'leftpane-section-container'
    | 'group-name-input'
    | 'recovery-phrase-seed-modal'
    | 'password-input-reconfirm'
    | 'conversation-header-subtitle'
    | 'password-input'
    | 'nickname-input'
    | 'image-upload-click'
    | 'profile-name-input'
    | 'your-profile-name'
    | 'edit-profile-dialog'
    | 'image-upload-section'
    | 'right-panel-group-name'
    | 'control-message'
    | 'header-conversation-name'
    | 'disappear-messages-type-and-time'
    | 'message-input'
    | 'messages-container'
    | 'decline-and-block-message-request'
    | 'session-dropdown'
    | 'path-light-container'
    | 'add-user-button'
    | 'back-button-conversation-options'
    | 'send-message-button'
    | 'scroll-to-bottom-button'
    | 'end-call'
    | 'modal-close-button'
    | 'end-voice-message'
    | 'back-button-message-details'
    | 'edit-profile-icon'
    | 'microphone-button'
    | 'call-button'
    | 'attachments-button'

    // generic button types
    | 'emoji-button'
    | 'reveal-blocked-user-settings'

    // left pane section types
    | 'theme-section'
    | 'settings-section'
    | 'message-section'
    | 'privacy-section'

    // settings menu item types
    | 'messageRequests-settings-menu-item' // needs to be tweaked
    | 'recoveryPhrase-settings-menu-item' // needs to be tweaked
    | 'privacy-settings-menu-item' // needs to be tweaked
    | 'notifications-settings-menu-item' // needs to be tweaked
    | 'conversations-settings-menu-item' // needs to be tweaked
    | 'appearance-settings-menu-item' // needs to be tweaked
    | 'help-settings-menu-item' // needs to be tweaked
    | 'permissions-settings-menu-item' // needs to be tweaked
    | 'ClearData-settings-menu-item' // TODO AUDRIC needs to be tweaked

    // timer options
    | 'time-option-0'
    | 'time-option-5'
    | 'time-option-10'
    | 'time-option-30'
    | 'time-option-60'
    | 'time-option-300'
    | 'time-option-1800'
    | 'time-option-3600'
    | 'time-option-21600'
    | 'time-option-43200'
    | 'time-option-86400'
    | 'time-option-604800'
    | 'time-option-1209600'

    // generic readably message (not control message)
    | 'message-content'

    // control message types
    | 'message-request-response-message'
    | 'interaction-notification'
    | 'data-extraction-notification'
    | 'group-update-message'
    | 'disappear-control-message'

    // subtle control message types
    | 'group-request-explanation'
    | 'conversation-request-explanation'
    | 'group-invite-control-message'
    | 'empty-conversation-notification'

    // call notification types
    | 'call-notification-missed-call'
    | 'call-notification-started-call'
    | 'call-notification-answered-a-call'

    // disappear options
    | 'disappear-after-send-option'
    | 'disappear-after-read-option'
    | 'disappear-legacy-option'
    | 'disappear-off-option'

    // settings toggle and buttons
    | 'remove-password-settings-button'
    | 'change-password-settings-button'
    | 'enable-read-receipts'
    | 'set-password-button'
    | 'enable-read-receipts'
    | 'enable-calls'
    | 'enable-microphone'
    | 'enable-follow-system-theme'
    | 'unblock-button-settings-screen'
    | 'save-attachment-from-details'
    | 'resend-msg-from-details'
    | 'reply-to-msg-from-details'
    | 'leave-group-button'
    | 'disappearing-messages'
    | 'group-members'
    | 'remove-moderators'
    | 'add-moderators'
    | 'edit-group-name'

    // SessionRadioGroup & SessionRadio
    | 'password-input-confirm'
    | 'msg-status'
    | 'input-device_and_network'
    | 'label-device_and_network'
    | 'input-device_only'
    | 'label-device_only'
    | 'input-deleteForEveryone'
    | 'label-deleteForEveryone'
    | 'input-deleteJustForMe'
    | 'label-deleteJustForMe'
    | 'input-enterForSend'
    | 'label-enterForSend'
    | 'input-enterForNewLine'
    | 'label-enterForNewLine'
    | 'input-message'
    | 'label-message'
    | 'input-name'
    | 'label-name'
    | 'input-count'
    | 'label-count'

    // to sort
    | 'restore-using-recovery'
    | 'link-device'
    | 'continue-session-button'
    | 'next-new-conversation-button'
    | 'reveal-recovery-phrase'
    | 'resend_invite_button'
    | 'session-confirm-cancel-button'
    | 'session-confirm-ok-button'
    | 'confirm-nickname'
    | 'path-light-svg'
    | 'group_member_status_text'
    | 'group_member_name'
    | 'resend_promote_button'
    | 'next-button'
    | 'save-button-profile-update'
    | 'save-button-profile-update'
    | 'copy-button-profile-update'
    | 'disappear-set-button'
    | 'decline-message-request'
    | 'accept-message-request'
    | 'mentions-popup-row'
    | 'session-id-signup'
    | 'three-dot-loading-animation'
    | 'recovery-phrase-input'
    | 'display-name-input'
    | 'new-session-conversation'
    | 'new-closed-group-name'
    | 'leftpane-primary-avatar'
    | 'img-leftpane-primary-avatar'
    | 'conversation-options-avatar'
    // modules profile name
    | 'module-conversation__user__profile-name'
    | 'module-message-search-result__header__name__profile-name'
    | 'module-message__author__profile-name'
    | 'module-contact-name__profile-name'
    | 'delete-from-details';

  interface HTMLAttributes {
    'data-testid'?: SessionDataTestId;
  }
}
