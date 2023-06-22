export type LocalizerKeys =
  | 'copyErrorAndQuit'
  | 'unknown'
  | 'databaseError'
  | 'mainMenuFile'
  | 'mainMenuEdit'
  | 'mainMenuView'
  | 'mainMenuWindow'
  | 'mainMenuHelp'
  | 'appMenuHide'
  | 'appMenuHideOthers'
  | 'appMenuUnhide'
  | 'appMenuQuit'
  | 'editMenuUndo'
  | 'editMenuRedo'
  | 'editMenuCut'
  | 'editMenuCopy'
  | 'editMenuPaste'
  | 'editMenuDeleteContact'
  | 'editMenuDeleteGroup'
  | 'editMenuSelectAll'
  | 'windowMenuClose'
  | 'windowMenuMinimize'
  | 'windowMenuZoom'
  | 'viewMenuResetZoom'
  | 'viewMenuZoomIn'
  | 'viewMenuZoomOut'
  | 'viewMenuToggleFullScreen'
  | 'viewMenuToggleDevTools'
  | 'contextMenuNoSuggestions'
  | 'openGroupInvitation'
  | 'joinOpenGroupAfterInvitationConfirmationTitle'
  | 'joinOpenGroupAfterInvitationConfirmationDesc'
  | 'couldntFindServerMatching'
  | 'enterSessionIDOrONSName'
  | 'startNewConversationBy...'
  | 'loading'
  | 'done'
  | 'youLeftTheGroup'
  | 'youGotKickedFromGroup'
  | 'unreadMessages'
  | 'debugLogExplanation'
  | 'reportIssue'
  | 'markAllAsRead'
  | 'incomingError'
  | 'media'
  | 'mediaEmptyState'
  | 'documents'
  | 'documentsEmptyState'
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'thisMonth'
  | 'voiceMessage'
  | 'stagedPreviewThumbnail'
  | 'previewThumbnail'
  | 'stagedImageAttachment'
  | 'oneNonImageAtATimeToast'
  | 'cannotMixImageAndNonImageAttachments'
  | 'maximumAttachments'
  | 'fileSizeWarning'
  | 'unableToLoadAttachment'
  | 'offline'
  | 'debugLog'
  | 'showDebugLog'
  | 'shareBugDetails'
  | 'goToReleaseNotes'
  | 'goToSupportPage'
  | 'about'
  | 'show'
  | 'sessionMessenger'
  | 'noSearchResults'
  | 'conversationsHeader'
  | 'contactsHeader'
  | 'messagesHeader'
  | 'settingsHeader'
  | 'typingAlt'
  | 'contactAvatarAlt'
  | 'downloadAttachment'
  | 'replyToMessage'
  | 'replyingToMessage'
  | 'originalMessageNotFound'
  | 'you'
  | 'audioPermissionNeededTitle'
  | 'audioPermissionNeeded'
  | 'audio'
  | 'video'
  | 'photo'
  | 'cannotUpdate'
  | 'cannotUpdateDetail'
  | 'ok'
  | 'cancel'
  | 'close'
  | 'continue'
  | 'error'
  | 'delete'
  | 'messageDeletionForbidden'
  | 'deleteJustForMe'
  | 'deleteForEveryone'
  | 'deleteMessagesQuestion'
  | 'deleteMessageQuestion'
  | 'deleteMessages'
  | 'deleteConversation'
  | 'deleted'
  | 'messageDeletedPlaceholder'
  | 'from'
  | 'to'
  | 'sent'
  | 'received'
  | 'sendMessage'
  | 'groupMembers'
  | 'moreInformation'
  | 'resend'
  | 'deleteConversationConfirmation'
  | 'clear'
  | 'clearAllData'
  | 'deleteAccountWarning'
  | 'deleteAccountFromLogin'
  | 'deleteContactConfirmation'
  | 'quoteThumbnailAlt'
  | 'imageAttachmentAlt'
  | 'videoAttachmentAlt'
  | 'lightboxImageAlt'
  | 'imageCaptionIconAlt'
  | 'addACaption'
  | 'copySessionID'
  | 'copyOpenGroupURL'
  | 'save'
  | 'saveLogToDesktop'
  | 'saved'
  | 'tookAScreenshot'
  | 'savedTheFile'
  | 'linkPreviewsTitle'
  | 'linkPreviewDescription'
  | 'linkPreviewsConfirmMessage'
  | 'mediaPermissionsTitle'
  | 'mediaPermissionsDescription'
  | 'spellCheckTitle'
  | 'spellCheckDescription'
  | 'spellCheckDirty'
  | 'readReceiptSettingDescription'
  | 'readReceiptSettingTitle'
  | 'typingIndicatorsSettingDescription'
  | 'typingIndicatorsSettingTitle'
  | 'zoomFactorSettingTitle'
  | 'themesSettingTitle'
  | 'primaryColor'
  | 'primaryColorGreen'
  | 'primaryColorBlue'
  | 'primaryColorYellow'
  | 'primaryColorPink'
  | 'primaryColorPurple'
  | 'primaryColorOrange'
  | 'primaryColorRed'
  | 'classicDarkThemeTitle'
  | 'classicLightThemeTitle'
  | 'oceanDarkThemeTitle'
  | 'oceanLightThemeTitle'
  | 'pruneSettingTitle'
  | 'pruneSettingDescription'
  | 'enable'
  | 'keepDisabled'
  | 'notificationSettingsDialog'
  | 'nameAndMessage'
  | 'noNameOrMessage'
  | 'nameOnly'
  | 'newMessage'
  | 'createConversationNewContact'
  | 'createConversationNewGroup'
  | 'joinACommunity'
  | 'chooseAnAction'
  | 'newMessages'
  | 'notificationMostRecentFrom'
  | 'notificationFrom'
  | 'notificationMostRecent'
  | 'sendFailed'
  | 'mediaMessage'
  | 'messageBodyMissing'
  | 'messageBody'
  | 'unblockToSend'
  | 'unblockGroupToSend'
  | 'timer'
  | 'timerModeRead'
  | 'timerModeSent'
  | 'youChangedTheTimer'
  | 'youChangedTheTimerLegacy'
  | 'theyChangedTheTimer'
  | 'theyChangedTheTimerLegacy'
  | 'timerOption_0_seconds'
  | 'timerOption_5_seconds'
  | 'timerOption_10_seconds'
  | 'timerOption_30_seconds'
  | 'timerOption_1_minute'
  | 'timerOption_5_minutes'
  | 'timerOption_30_minutes'
  | 'timerOption_1_hour'
  | 'timerOption_6_hours'
  | 'timerOption_12_hours'
  | 'timerOption_1_day'
  | 'timerOption_1_week'
  | 'timerOption_2_weeks'
  | 'timerOption_0_seconds_abbreviated'
  | 'timerOption_5_seconds_abbreviated'
  | 'timerOption_10_seconds_abbreviated'
  | 'timerOption_30_seconds_abbreviated'
  | 'timerOption_1_minute_abbreviated'
  | 'timerOption_5_minutes_abbreviated'
  | 'timerOption_30_minutes_abbreviated'
  | 'timerOption_1_hour_abbreviated'
  | 'timerOption_6_hours_abbreviated'
  | 'timerOption_12_hours_abbreviated'
  | 'timerOption_1_day_abbreviated'
  | 'timerOption_1_week_abbreviated'
  | 'timerOption_2_weeks_abbreviated'
  | 'disappearingMessages'
  | 'disappearingMessagesModeOutdated'
  | 'disappearingMessagesModeLabel'
  | 'disappearingMessagesModeOff'
  | 'disappearingMessagesModeAfterRead'
  | 'disappearingMessagesModeAfterReadSubtitle'
  | 'disappearingMessagesModeAfterSend'
  | 'disappearingMessagesModeAfterSendSubtitle'
  | 'disappearingMessagesModeLegacy'
  | 'disappearingMessagesModeLegacySubtitle'
  | 'disappearingMessagesDisabled'
  | 'disabledDisappearingMessages'
  | 'youDisabledDisappearingMessages'
  | 'timerSetTo'
  | 'set'
  | 'changeNickname'
  | 'clearNickname'
  | 'nicknamePlaceholder'
  | 'changeNicknameMessage'
  | 'noteToSelf'
  | 'hideMenuBarTitle'
  | 'hideMenuBarDescription'
  | 'startConversation'
  | 'invalidNumberError'
  | 'failedResolveOns'
  | 'autoUpdateSettingTitle'
  | 'autoUpdateSettingDescription'
  | 'autoUpdateNewVersionTitle'
  | 'autoUpdateNewVersionMessage'
  | 'autoUpdateNewVersionInstructions'
  | 'autoUpdateRestartButtonLabel'
  | 'autoUpdateLaterButtonLabel'
  | 'autoUpdateDownloadButtonLabel'
  | 'autoUpdateDownloadedMessage'
  | 'autoUpdateDownloadInstructions'
  | 'leftTheGroup'
  | 'multipleLeftTheGroup'
  | 'updatedTheGroup'
  | 'titleIsNow'
  | 'joinedTheGroup'
  | 'multipleJoinedTheGroup'
  | 'kickedFromTheGroup'
  | 'multipleKickedFromTheGroup'
  | 'block'
  | 'unblock'
  | 'unblocked'
  | 'blocked'
  | 'blockedSettingsTitle'
  | 'conversationsSettingsTitle'
  | 'unbanUser'
  | 'userUnbanned'
  | 'userUnbanFailed'
  | 'banUser'
  | 'banUserAndDeleteAll'
  | 'userBanned'
  | 'userBanFailed'
  | 'leaveGroup'
  | 'leaveAndRemoveForEveryone'
  | 'leaveGroupConfirmation'
  | 'leaveGroupConfirmationAdmin'
  | 'cannotRemoveCreatorFromGroup'
  | 'cannotRemoveCreatorFromGroupDesc'
  | 'noContactsForGroup'
  | 'failedToAddAsModerator'
  | 'failedToRemoveFromModerator'
  | 'copyMessage'
  | 'selectMessage'
  | 'editGroup'
  | 'editGroupName'
  | 'updateGroupDialogTitle'
  | 'showRecoveryPhrase'
  | 'yourSessionID'
  | 'setAccountPasswordTitle'
  | 'setAccountPasswordDescription'
  | 'changeAccountPasswordTitle'
  | 'changeAccountPasswordDescription'
  | 'removeAccountPasswordTitle'
  | 'removeAccountPasswordDescription'
  | 'enterPassword'
  | 'confirmPassword'
  | 'enterNewPassword'
  | 'confirmNewPassword'
  | 'showRecoveryPhrasePasswordRequest'
  | 'recoveryPhraseSavePromptMain'
  | 'invalidOpenGroupUrl'
  | 'copiedToClipboard'
  | 'passwordViewTitle'
  | 'password'
  | 'setPassword'
  | 'changePassword'
  | 'createPassword'
  | 'removePassword'
  | 'maxPasswordAttempts'
  | 'typeInOldPassword'
  | 'invalidOldPassword'
  | 'invalidPassword'
  | 'noGivenPassword'
  | 'passwordsDoNotMatch'
  | 'setPasswordInvalid'
  | 'changePasswordInvalid'
  | 'removePasswordInvalid'
  | 'setPasswordTitle'
  | 'changePasswordTitle'
  | 'removePasswordTitle'
  | 'setPasswordToastDescription'
  | 'changePasswordToastDescription'
  | 'removePasswordToastDescription'
  | 'publicChatExists'
  | 'connectToServerFail'
  | 'connectingToServer'
  | 'connectToServerSuccess'
  | 'setPasswordFail'
  | 'passwordLengthError'
  | 'passwordTypeError'
  | 'passwordCharacterError'
  | 'remove'
  | 'invalidSessionId'
  | 'invalidPubkeyFormat'
  | 'emptyGroupNameError'
  | 'editProfileModalTitle'
  | 'groupNamePlaceholder'
  | 'inviteContacts'
  | 'addModerators'
  | 'removeModerators'
  | 'addAsModerator'
  | 'removeFromModerators'
  | 'add'
  | 'addingContacts'
  | 'noContactsToAdd'
  | 'noMembersInThisGroup'
  | 'noModeratorsToRemove'
  | 'onlyAdminCanRemoveMembers'
  | 'onlyAdminCanRemoveMembersDesc'
  | 'createAccount'
  | 'startInTrayTitle'
  | 'startInTrayDescription'
  | 'yourUniqueSessionID'
  | 'allUsersAreRandomly...'
  | 'getStarted'
  | 'createSessionID'
  | 'recoveryPhrase'
  | 'enterRecoveryPhrase'
  | 'displayName'
  | 'anonymous'
  | 'removeResidueMembers'
  | 'enterDisplayName'
  | 'continueYourSession'
  | 'linkDevice'
  | 'restoreUsingRecoveryPhrase'
  | 'or'
  | 'ByUsingThisService...'
  | 'beginYourSession'
  | 'welcomeToYourSession'
  | 'searchFor...'
  | 'searchForContactsOnly'
  | 'enterSessionID'
  | 'enterSessionIDOfRecipient'
  | 'message'
  | 'appearanceSettingsTitle'
  | 'privacySettingsTitle'
  | 'notificationsSettingsTitle'
  | 'audioNotificationsSettingsTitle'
  | 'notificationsSettingsContent'
  | 'notificationPreview'
  | 'recoveryPhraseEmpty'
  | 'displayNameEmpty'
  | 'displayNameTooLong'
  | 'members'
  | 'activeMembers'
  | 'join'
  | 'joinOpenGroup'
  | 'createGroup'
  | 'create'
  | 'createClosedGroupNamePrompt'
  | 'createClosedGroupPlaceholder'
  | 'openGroupURL'
  | 'enterAnOpenGroupURL'
  | 'next'
  | 'invalidGroupNameTooShort'
  | 'invalidGroupNameTooLong'
  | 'pickClosedGroupMember'
  | 'closedGroupMaxSize'
  | 'noBlockedContacts'
  | 'userAddedToModerators'
  | 'userRemovedFromModerators'
  | 'orJoinOneOfThese'
  | 'helpUsTranslateSession'
  | 'closedGroupInviteFailTitle'
  | 'closedGroupInviteFailTitlePlural'
  | 'closedGroupInviteFailMessage'
  | 'closedGroupInviteFailMessagePlural'
  | 'closedGroupInviteOkText'
  | 'closedGroupInviteSuccessTitlePlural'
  | 'closedGroupInviteSuccessTitle'
  | 'closedGroupInviteSuccessMessage'
  | 'notificationForConvo'
  | 'notificationForConvo_all'
  | 'notificationForConvo_disabled'
  | 'notificationForConvo_mentions_only'
  | 'onionPathIndicatorTitle'
  | 'onionPathIndicatorDescription'
  | 'unknownCountry'
  | 'device'
  | 'destination'
  | 'learnMore'
  | 'linkVisitWarningTitle'
  | 'linkVisitWarningMessage'
  | 'open'
  | 'audioMessageAutoplayTitle'
  | 'audioMessageAutoplayDescription'
  | 'clickToTrustContact'
  | 'trustThisContactDialogTitle'
  | 'trustThisContactDialogDescription'
  | 'pinConversation'
  | 'unpinConversation'
  | 'markUnread'
  | 'showUserDetails'
  | 'sendRecoveryPhraseTitle'
  | 'sendRecoveryPhraseMessage'
  | 'dialogClearAllDataDeletionFailedTitle'
  | 'dialogClearAllDataDeletionFailedDesc'
  | 'dialogClearAllDataDeletionFailedTitleQuestion'
  | 'dialogClearAllDataDeletionFailedMultiple'
  | 'dialogClearAllDataDeletionQuestion'
  | 'clearDevice'
  | 'tryAgain'
  | 'areYouSureClearDevice'
  | 'deviceOnly'
  | 'entireAccount'
  | 'areYouSureDeleteDeviceOnly'
  | 'areYouSureDeleteEntireAccount'
  | 'iAmSure'
  | 'recoveryPhraseSecureTitle'
  | 'recoveryPhraseRevealMessage'
  | 'recoveryPhraseRevealButtonText'
  | 'notificationSubtitle'
  | 'surveyTitle'
  | 'faq'
  | 'support'
  | 'clearAll'
  | 'clearDataSettingsTitle'
  | 'messageRequests'
  | 'requestsSubtitle'
  | 'requestsPlaceholder'
  | 'hideRequestBannerDescription'
  | 'incomingCallFrom'
  | 'ringing'
  | 'establishingConnection'
  | 'accept'
  | 'decline'
  | 'endCall'
  | 'permissionsSettingsTitle'
  | 'helpSettingsTitle'
  | 'cameraPermissionNeededTitle'
  | 'cameraPermissionNeeded'
  | 'unableToCall'
  | 'unableToCallTitle'
  | 'callMissed'
  | 'callMissedTitle'
  | 'noCameraFound'
  | 'noAudioInputFound'
  | 'noAudioOutputFound'
  | 'callMediaPermissionsTitle'
  | 'callMissedCausePermission'
  | 'callMissedNotApproved'
  | 'callMediaPermissionsDescription'
  | 'callMediaPermissionsDialogContent'
  | 'callMediaPermissionsDialogTitle'
  | 'startedACall'
  | 'answeredACall'
  | 'trimDatabase'
  | 'trimDatabaseDescription'
  | 'trimDatabaseConfirmationBody'
  | 'pleaseWaitOpenAndOptimizeDb'
  | 'messageRequestPending'
  | 'messageRequestAccepted'
  | 'messageRequestAcceptedOurs'
  | 'messageRequestAcceptedOursNoName'
  | 'declineRequestMessage'
  | 'respondingToRequestWarning'
  | 'hideRequestBanner'
  | 'openMessageRequestInbox'
  | 'noMessageRequestsPending'
  | 'noMediaUntilApproved'
  | 'mustBeApproved'
  | 'youHaveANewFriendRequest'
  | 'clearAllConfirmationTitle'
  | 'clearAllConfirmationBody'
  | 'noMessagesInReadOnly'
  | 'noMessagesInNoteToSelf'
  | 'noMessagesInEverythingElse'
  | 'hideBanner'
  | 'someOfYourDeviceUseOutdatedVersion'
  | 'openMessageRequestInboxDescription'
  | 'clearAllReactions'
  | 'expandedReactionsText'
  | 'reactionNotification'
  | 'rateLimitReactMessage'
  | 'otherSingular'
  | 'otherPlural'
  | 'reactionPopup'
  | 'reactionPopupOne'
  | 'reactionPopupTwo'
  | 'reactionPopupThree'
  | 'reactionPopupMany'
  | 'reactionListCountSingular'
  | 'reactionListCountPlural'
  | 'settingAppliesToEveryone'
  | 'onlyGroupAdminsCanChange'
  | 'messageInfo'
  | 'fileId'
  | 'fileSize'
  | 'fileType'
  | 'resolution'
  | 'duration'
  | 'notApplicable';
