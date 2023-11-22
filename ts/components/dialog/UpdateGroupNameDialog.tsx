/* eslint-disable @typescript-eslint/no-misused-promises */
import autoBind from 'auto-bind';
import classNames from 'classnames';
import React from 'react';

import { clone } from 'lodash';
import { ConversationModel } from '../../models/conversation';
import { ConvoHub } from '../../session/conversations';
import { ClosedGroup } from '../../session/group/closed-group';
import { initiateOpenGroupUpdate } from '../../session/group/open-group';
import { PubKey } from '../../session/types';
import { groupInfoActions } from '../../state/ducks/metaGroups';
import { updateGroupNameModal } from '../../state/ducks/modalDialog';
import { getLibGroupNameOutsideRedux } from '../../state/selectors/groups';
import { pickFileForAvatar } from '../../types/attachments/VisualAttachment';
import { SessionWrapperModal } from '../SessionWrapperModal';
import { Avatar, AvatarSize } from '../avatar/Avatar';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../basic/SessionButton';
import { SpacerMD } from '../basic/Text';

type Props = {
  conversationId: string;
};

interface State {
  groupName: string | undefined;
  originalGroupName: string;
  errorDisplayed: boolean;
  errorMessage: string;
  oldAvatarPath: string | null;
  newAvatarObjecturl: string | null;
}

// TODO break those last class bases components into functional ones (search for `extends React`)
export class UpdateGroupNameDialog extends React.Component<Props, State> {
  private readonly convo: ConversationModel;

  constructor(props: Props) {
    super(props);

    autoBind(this);
    this.convo = ConvoHub.use().get(props.conversationId);

    const libGroupName = getLibGroupNameOutsideRedux(props.conversationId);
    const groupNameFromConvo = this.convo.getRealSessionUsername();
    const groupName = libGroupName || groupNameFromConvo;

    this.state = {
      groupName: clone(groupName),
      originalGroupName: clone(groupName) || '',
      errorDisplayed: false,
      errorMessage: 'placeholder',
      oldAvatarPath: this.convo.getAvatarPath(),
      newAvatarObjecturl: null,
    };
  }

  public componentDidMount() {
    window.addEventListener('keyup', this.onKeyUp);
  }

  public componentWillUnmount() {
    window.removeEventListener('keyup', this.onKeyUp);
  }

  public onClickOK() {
    const { groupName, newAvatarObjecturl, oldAvatarPath } = this.state;
    const trimmedGroupName = groupName?.trim();
    if (!trimmedGroupName) {
      this.onShowError(window.i18n('emptyGroupNameError'));

      return;
    }

    if (trimmedGroupName !== this.state.originalGroupName || newAvatarObjecturl !== oldAvatarPath) {
      if (this.convo.isPublic()) {
        void initiateOpenGroupUpdate(this.convo.id, trimmedGroupName, {
          objectUrl: newAvatarObjecturl,
        });
        this.closeDialog();
      } else {
        const groupPk = this.convo.id;
        if (PubKey.is03Pubkey(groupPk)) {
          const groupv2Action = groupInfoActions.currentDeviceGroupNameChange({
            groupPk,
            newName: trimmedGroupName,
          });
          window.inboxStore.dispatch(groupv2Action as any);

          return; // keeping the dialog open until the async thunk is done
        }
        const members = this.convo.getGroupMembers() || [];

        void ClosedGroup.initiateClosedGroupUpdate(this.convo.id, trimmedGroupName, members);
        this.closeDialog();
      }
    }
  }

  public render() {
    const okText = window.i18n('ok');
    const cancelText = window.i18n('cancel');
    const titleText = window.i18n('updateGroupDialogTitle', [
      this.convo.getRealSessionUsername() || window.i18n('unknown'),
    ]);

    const errorMsg = this.state.errorMessage;
    const errorMessageClasses = classNames(
      'error-message',
      this.state.errorDisplayed ? 'error-shown' : 'error-faded'
    );

    const isAdmin = !this.convo.isPublic();

    return (
      <SessionWrapperModal
        title={titleText}
        onClose={() => this.closeDialog()}
        additionalClassName="update-group-dialog"
      >
        {this.state.errorDisplayed ? (
          <>
            <SpacerMD />
            <p className={errorMessageClasses}>{errorMsg}</p>
            <SpacerMD />
          </>
        ) : null}

        {this.renderAvatar()}
        <SpacerMD />

        {isAdmin ? (
          <input
            type="text"
            className="profile-name-input"
            value={this.state.groupName}
            placeholder={window.i18n('groupNamePlaceholder')}
            onChange={this.onGroupNameChanged}
            tabIndex={0}
            required={true}
            aria-required={true}
            autoFocus={true}
            data-testid="group-name-input"
          />
        ) : null}

        <div className="session-modal__button-group">
          <SessionButton
            text={okText}
            onClick={this.onClickOK}
            buttonType={SessionButtonType.Simple}
          />
          <SessionButton
            text={cancelText}
            buttonColor={SessionButtonColor.Danger}
            buttonType={SessionButtonType.Simple}
            onClick={this.closeDialog}
          />
        </div>
      </SessionWrapperModal>
    );
  }

  private onShowError(msg: string) {
    if (this.state.errorDisplayed) {
      return;
    }

    this.setState({
      errorDisplayed: true,
      errorMessage: msg,
    });

    setTimeout(() => {
      this.setState({
        errorDisplayed: false,
      });
    }, 3000);
  }

  private onKeyUp(event: any) {
    switch (event.key) {
      case 'Enter':
        this.onClickOK();
        break;
      case 'Esc':
      case 'Escape':
        this.closeDialog();
        break;
      default:
    }
  }

  private closeDialog() {
    window.removeEventListener('keyup', this.onKeyUp);

    window.inboxStore?.dispatch(updateGroupNameModal(null));
  }

  private onGroupNameChanged(event: any) {
    const groupName = event.target.value;
    this.setState(state => {
      return {
        ...state,
        groupName,
      };
    });
  }

  private renderAvatar() {
    const isPublic = this.convo.isPublic();
    const pubkey = this.convo.id;

    const { newAvatarObjecturl, oldAvatarPath } = this.state;

    if (!isPublic) {
      return undefined;
    }

    return (
      <div className="avatar-center">
        <div className="avatar-center-inner">
          <Avatar
            forcedAvatarPath={newAvatarObjecturl || oldAvatarPath}
            size={AvatarSize.XL}
            pubkey={pubkey}
          />
          <div className="image-upload-section" role="button" onClick={this.fireInputEvent} />
        </div>
      </div>
    );
  }

  private async fireInputEvent() {
    const scaledObjectUrl = await pickFileForAvatar();
    if (scaledObjectUrl) {
      this.setState({ newAvatarObjecturl: scaledObjectUrl });
    }
  }
}
