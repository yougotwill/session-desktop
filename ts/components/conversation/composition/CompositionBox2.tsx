import { AbortController } from 'abort-controller';
import { useRef, useState, type MutableRefObject } from 'react';
import { isEmpty } from 'lodash';
import styled from 'styled-components';
import { SettingsKey } from '../../../data/settings-key';
import type { ReduxConversationType } from '../../../state/ducks/conversations';
import { useHTMLDirection, type HTMLDirection } from '../../../util/i18n/rtlSupport';
import { LinkPreviews } from '../../../util/linkPreviews';
import { Flex } from '../../basic/Flex';
import { SessionQuotedMessageComposition } from '../SessionQuotedMessageComposition';
import {
  getPreview,
  LINK_PREVIEW_TIMEOUT,
  SessionStagedLinkPreview,
} from '../SessionStagedLinkPreview';
import type {
  SendMessageType,
  ReplyingToMessageProps,
  StagedAttachmentType,
  StagedLinkPreviewData,
} from './CompositionBox';
import type { AttachmentType } from '../../../types/Attachment';
import { StagedAttachmentList } from '../StagedAttachmentList';
import { ToastUtils } from '../../../session/utils';
import { CaptionEditor } from '../../CaptionEditor';
import { SessionRecording } from '../SessionRecording';
import { getMediaPermissionsSettings } from '../../settings/SessionSettings';
import {
  AddStagedAttachmentButton,
  SendMessageButton,
  StartRecordingButton,
  ToggleEmojiButton,
} from './CompositionButtons';
import { CompositionTextArea } from './CompositionTextArea';
import { SessionEmojiPanel, StyledEmojiPanel } from '../SessionEmojiPanel';
import type { SuggestionDataItem } from 'react-mentions';
import { getMentionsInput } from '../../../state/selectors/conversations';
import { getConversationController } from '../../../session/conversations';

const StyledSendMessageInput = styled.div<{ dir?: HTMLDirection }>`
  position: relative;
  cursor: text;
  display: flex;
  align-items: center;
  flex-grow: 1;
  min-height: var(--composition-container-height);
  padding: var(--margins-xs) 0;
  ${props => props.dir === 'rtl' && 'margin-inline-start: var(--margins-sm);'}
  z-index: 1;
  background-color: inherit;

  ul {
    max-height: 70vh;
    overflow: auto;
  }

  textarea {
    font-family: var(--font-default);
    min-height: calc(var(--composition-container-height) / 3);
    max-height: calc(3 * var(--composition-container-height));
    margin-right: var(--margins-md);
    color: var(--text-color-primary);

    background: transparent;
    resize: none;
    display: flex;
    flex-grow: 1;
    outline: none;
    border: none;
    font-size: 14px;
    line-height: var(--font-size-h2);
    letter-spacing: 0.5px;
  }

  &__emoji-overlay {
    // Should have identical properties to the textarea above to line up perfectly.
    position: absolute;
    font-size: 14px;
    font-family: var(--font-default);
    margin-left: 2px;
    line-height: var(--font-size-h2);
    letter-spacing: 0.5px;
    color: var(--transparent-color);
  }
`;

const StyledEmojiPanelContainer = styled.div<{ dir?: HTMLDirection }>`
  ${StyledEmojiPanel} {
    position: absolute;
    bottom: 68px;
    ${props => (props.dir === 'rtl' ? 'left: 0px' : 'right: 0px;')}
  }
`;

const CompositionView = (props: {
  selectedConversation: ReduxConversationType | undefined;
  showEmojiPanel: boolean;
  draft: string;
  setDraft: (newDraft: string) => void;
  stagedAttachments: Array<StagedAttachmentType>;
  onChooseAttachment: () => void;
  container: MutableRefObject<HTMLInputElement> | undefined;
  fileInput: MutableRefObject<HTMLInputElement> | undefined;
  textarea: MutableRefObject<HTMLTextAreaElement> | undefined;
  onLoadVoiceNoteView: () => Promise<void>;
  focusCompositionBox: () => void;
}) => {
  const {
    selectedConversation,
    showEmojiPanel,
    draft,
    setDraft,
    stagedAttachments,
    onChooseAttachment,
    container,
    fileInput,
    textarea,
    onLoadVoiceNoteView,
    focusCompositionBox,
  } = props;
  // TODO set to getSelectedCanWrite(state) on load
  const [typingEnabled, setTypingEnabled] = useState<boolean>(false);

  const htmlDirection = useHTMLDirection();

  // we can only send a message if the conversation allows writing in it AND
  // - we've got a message body OR
  // - we've got a staged attachments
  const showSendButton = typingEnabled && (!isEmpty(draft) || !isEmpty(stagedAttachments));

  const fetchUsersForOpenGroup = (
    query: string,
    callback: (data: Array<SuggestionDataItem>) => void
  ) => {
    const mentionsInput = getMentionsInput(window?.inboxStore?.getState() || []);
    const filtered =
      mentionsInput
        .filter(d => !!d)
        .filter(d => d.authorProfileName !== 'Anonymous')
        .filter(d => d.authorProfileName?.toLowerCase()?.includes(query.toLowerCase()))
        // Transform the users to what react-mentions expects
        .map(user => {
          return {
            display: user.authorProfileName,
            id: user.id,
          };
        }) || [];

    callback(filtered);
  };

  const fetchUsersForClosedGroup = (
    query: string,
    callback: (data: Array<SuggestionDataItem>) => void
  ) => {
    if (!selectedConversation) {
      return;
    }
    const allPubKeys = selectedConversation.members;
    if (!allPubKeys || allPubKeys.length === 0) {
      return;
    }

    const allMembers = allPubKeys.map(pubKey => {
      const conv = getConversationController().get(pubKey);
      const profileName =
        conv?.getNicknameOrRealUsernameOrPlaceholder() || window.i18n('anonymous');

      return {
        id: pubKey,
        authorProfileName: profileName,
      };
    });
    // keep anonymous members so we can still quote them with their id
    const members = allMembers
      .filter(d => !!d)
      .filter(
        d =>
          d.authorProfileName?.toLowerCase()?.includes(query.toLowerCase()) || !d.authorProfileName
      );

    // Transform the users to what react-mentions expects
    const mentionsData = members.map(user => ({
      display: user.authorProfileName || window.i18n('anonymous'),
      id: user.id,
    }));
    callback(mentionsData);
  };

  const fetchUsersForGroup = (
    query: string,
    callback: (data: Array<SuggestionDataItem>) => void
  ) => {
    let overridenQuery = query;
    if (!query) {
      overridenQuery = '';
    }
    if (!selectedConversation) {
      return;
    }

    if (selectedConversation.isPrivate) {
      return;
    }

    if (selectedConversation.isPublic) {
      fetchUsersForOpenGroup(overridenQuery, callback);
      return;
    }
    // can only be a closed group here
    fetchUsersForClosedGroup(overridenQuery, callback);
  };

  const onKeyDown = (event: any) => {
    const onKeyDown = async (event: any) => {
    const isEnter = event.key === 'Enter';
    const isShiftEnter = event.shiftKey && isEnter;
    const isShiftSendEnabled = window.getSettingValue(SettingsKey.hasShiftSendEnabled) as boolean;
    const isNotComposing = !event.nativeEvent.isComposing;

    if (isShiftSendEnabled && isEnter && isNotComposing) {
      event.preventDefault();
      if (isShiftEnter) {
        await this.onSendMessage();
      } else {
        this.insertNewLine();
      }
    } else if (isEnter && !event.shiftKey && isNotComposing) {
      event.preventDefault();
      await this.onSendMessage();
    } else if (event.key === 'Escape' && showEmojiPanel) {
      this.hideEmojiPanel();
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      // swallow pageUp events if they occurs on the composition box (it breaks the app layout)
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // if (container?.current === null || textarea?.current === null) {
  //   return null;
  // }

  /* eslint-disable @typescript-eslint/no-misused-promises */

  return (
    <Flex
      dir={htmlDirection}
      container={true}
      flexDirection={'row'}
      alignItems={'center'}
      width={'100%'}
    >
      {typingEnabled && <AddStagedAttachmentButton onClick={onChooseAttachment} />}
      <input
        className="hidden"
        placeholder="Attachment"
        multiple={true}
        ref={fileInput}
        type="file"
        onChange={onChooseAttachment}
      />
      {typingEnabled && <StartRecordingButton onClick={onLoadVoiceNoteView} />}
      <StyledSendMessageInput
        role="main"
        dir={htmlDirection}
        onClick={focusCompositionBox} // used to focus on the textarea when clicking in its container
        ref={container}
        data-testid="message-input"
      >
        <CompositionTextArea
          draft={draft}
          setDraft={setDraft}
          container={container}
          textAreaRef={textarea}
          fetchUsersForGroup={fetchUsersForGroup}
          typingEnabled={typingEnabled}
          onKeyDown={onKeyDown}
        />
      </StyledSendMessageInput>
      {typingEnabled && (
        <ToggleEmojiButton ref={this.emojiPanelButton} onClick={this.toggleEmojiPanel} />
      )}
      {showSendButton && <SendMessageButton onClick={this.onSendMessage} />}
      {typingEnabled && showEmojiPanel && (
        <StyledEmojiPanelContainer role="button" dir={htmlDirection}>
          <SessionEmojiPanel
            ref={this.emojiPanel}
            show={showEmojiPanel}
            onEmojiClicked={this.onEmojiClick}
            onKeyDown={onKeyDown}
          />
        </StyledEmojiPanelContainer>
      )}
    </Flex>
  );
};

type Props = {
  sendMessage: (msg: SendMessageType) => void;
  selectedConversationKey?: string;
  selectedConversation: ReduxConversationType | undefined;
  typingEnabled: boolean;
  quotedMessageProps?: ReplyingToMessageProps;
  stagedAttachments: Array<StagedAttachmentType>;
  onChoseAttachments: (newAttachments: Array<File>) => void;
  htmlDirection: HTMLDirection;
};

export const CompositionBox2 = (props: Props) => {
  const { stagedAttachments, quotedMessageProps } = props;

  // TODO set to newConvoId from getDefaultState
  const [draft, setDraft] = useState('');
  const [ignoredLink, setIgnoreLink] = useState<string | undefined>(); // set the ignored url when users closed the link preview
  const [stagedLinkPreview, setStageLinkPreview] = useState<StagedLinkPreviewData | undefined>();
  const [linkPreviewAbortController, setLinkPreviewAbortController] = useState<AbortController>();
  const [showCaptionEditor, setShowCaptionEditor] = useState<AttachmentType | undefined>();
  const [showRecordingView, setShowRecordingView] = useState<boolean>(false);
  const [showEmojiPanel, setShowEmojiPanel] = useState<boolean>(false);

  const container = useRef<HTMLDivElement>();
  const fileInput = useRef<HTMLInputElement>();
  const textarea = useRef<HTMLTextAreaElement>();

  const fetchLinkPreview = (firstLink: string) => {
    // mark the link preview as loading, no data are set yet
    setStageLinkPreview({
      isLoaded: false,
      url: firstLink,
      domain: null,
      image: undefined,
      title: null,
    });

    const abortController = new AbortController();
    linkPreviewAbortController?.abort();
    setLinkPreviewAbortController(abortController);

    setTimeout(() => {
      abortController.abort();
    }, LINK_PREVIEW_TIMEOUT);

    // TODO change to async / await
    // eslint-disable-next-line more/no-then
    getPreview(firstLink, abortController.signal)
      .then(ret => {
        // we finished loading the preview, and checking the abortConrtoller, we are still not aborted.
        // => update the staged preview
        if (linkPreviewAbortController && !linkPreviewAbortController.signal.aborted) {
          setStageLinkPreview({
            isLoaded: true,
            title: ret?.title || null,
            url: ret?.url || null,
            domain: (ret?.url && LinkPreviews.getDomain(ret.url)) || '',
            image: ret?.image,
          });
        } else if (linkPreviewAbortController) {
          setStageLinkPreview({
            isLoaded: false,
            title: null,
            url: null,
            domain: null,
            image: undefined,
          });
          setLinkPreviewAbortController(undefined);
        }
      })
      .catch(err => {
        window?.log?.warn('fetch link preview: ', err);
        const aborted = linkPreviewAbortController?.signal.aborted;
        setLinkPreviewAbortController(undefined);
        // if we were aborted, it either means the UI was unmount, or more probably,
        // than the message was sent without the link preview.
        // So be sure to reset the staged link preview so it is not sent with the next message.

        // if we were not aborted, it's probably just an error on the fetch. Nothing to do except mark the fetch as done (with errors)

        if (aborted) {
          setStageLinkPreview(undefined);
        } else {
          setStageLinkPreview({
            isLoaded: true,
            title: null,
            url: firstLink,
            domain: null,
            image: undefined,
          });
        }
      });
  };

  const renderStagedLinkPreview = () => {
    // Don't generate link previews if user has turned them off
    if (!(window.getSettingValue(SettingsKey.settingsLinkPreview) || false)) {
      return null;
    }

    // Don't render link previews if quoted message or attachments are already added
    if (stagedAttachments.length !== 0 || quotedMessageProps?.id) {
      return null;
    }
    // we try to match the first link found in the current message
    const links = LinkPreviews.findLinks(draft, undefined);
    if (!links || links.length === 0 || ignoredLink === links[0]) {
      if (stagedLinkPreview) {
        setStageLinkPreview(undefined);
      }
      return null;
    }
    const firstLink = links[0];
    // if the first link changed, reset the ignored link so that the preview is generated
    if (ignoredLink && ignoredLink !== firstLink) {
      setIgnoreLink(undefined);
    }
    if (firstLink !== stagedLinkPreview?.url) {
      // trigger fetching of link preview data and image
      fetchLinkPreview(firstLink);
    }

    // if the fetch did not start yet, just don't show anything
    if (!stagedLinkPreview) {
      return null;
    }

    const { isLoaded, title, domain, image } = stagedLinkPreview;

    return (
      <SessionStagedLinkPreview
        isLoaded={isLoaded}
        title={title}
        domain={domain}
        image={image}
        url={firstLink}
        onClose={url => {
          setIgnoreLink(url);
        }}
      />
    );
  };

  const onClickAttachment = (attachment: AttachmentType) => {
    setShowCaptionEditor(attachment);
  };

  const onChooseAttachment = () => {
    if (!props.selectedConversation?.didApproveMe && props.selectedConversation?.isPrivate) {
      ToastUtils.pushNoMediaUntilApproved();
      return;
    }
    fileInput.current?.click();
  };

  const renderCaptionEditor = (attachment?: AttachmentType) => {
    if (attachment) {
      const onSave = (caption: string) => {
        // eslint-disable-next-line no-param-reassign
        attachment.caption = caption;
        ToastUtils.pushToastInfo('saved', window.i18n.stripped('saved'));
        // close the lightbox on save
        setShowCaptionEditor(undefined);
      };

      const url = attachment.videoUrl || attachment.url;
      return (
        <CaptionEditor
          attachment={attachment}
          url={url}
          onSave={onSave}
          caption={attachment.caption}
          onClose={() => {
            setShowCaptionEditor(undefined);
          }}
        />
      );
    }
    return null;
  };

  const sendVoiceMessage = async (audioBlob: Blob) => {
    if (!this.state.showRecordingView) {
      return;
    }

    const savedAudioFile = await processNewAttachment({
      data: await audioBlob.arrayBuffer(),
      isRaw: true,
      contentType: MIME.AUDIO_MP3,
    });
    // { ...savedAudioFile, path: savedAudioFile.path },
    const audioAttachment: StagedAttachmentType = {
      file: new File([], 'session-audio-message'), // this is just to emulate a file for the staged attachment type of that audio file
      contentType: MIME.AUDIO_MP3,
      size: savedAudioFile.size,
      fileSize: null,
      screenshot: null,
      fileName: 'session-audio-message',
      thumbnail: null,
      url: '',
      isVoiceMessage: true,
      path: savedAudioFile.path,
    };

    this.props.sendMessage({
      body: '',
      attachments: [audioAttachment],
      preview: undefined,
      quote: undefined,
      groupInvitation: undefined,
    });

    this.onExitVoiceNoteView();
  };

  const onLoadVoiceNoteView = async () => {
    if (!getMediaPermissionsSettings()) {
      ToastUtils.pushAudioPermissionNeeded();
      return;
    }
    setShowRecordingView(true);
    setShowEmojiPanel(false);
  };

  const onExitVoiceNoteView = () => {
    setShowRecordingView(false);
  };

  return (
    <Flex flexDirection="column">
      <SessionQuotedMessageComposition />
      {renderStagedLinkPreview()}
      {stagedAttachments && stagedAttachments.length ? (
        <>
          <StagedAttachmentList
            attachments={stagedAttachments}
            onClickAttachment={onClickAttachment}
            onAddAttachment={onChooseAttachment}
          />
          {renderCaptionEditor(showCaptionEditor)}
        </>
      ) : null}
      <div className="composition-container">
        {showRecordingView ? (
          <SessionRecording
            sendVoiceMessage={sendVoiceMessage}
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onLoadVoiceNoteView={onLoadVoiceNoteView}
            onExitVoiceNoteView={onExitVoiceNoteView}
          />
        ) : (
          <CompositionView
          selectedConversation={selectedConversation}
          showEmojiPanel={showEmojiPanel}
          draft={draft}
          setDraft={setDraft}
          stagedAttachments={stagedAttachments}
          onChooseAttachment={onChooseAttachment}
          container={container}
          fileInput={fileInput}
          textarea={textarea}
          onLoadVoiceNoteView={onLoadVoiceNoteView}
          focusCompositionBox={focusCompositionBox}
          />
        )}
      </div>
    </Flex>
  );
};
