import { useState } from 'react';

import { useDispatch, useSelector } from 'react-redux';
import useKey from 'react-use/lib/useKey';
import styled from 'styled-components';

import { concat, isEmpty } from 'lodash';
import useUpdate from 'react-use/lib/useUpdate';
import { MemberListItem } from '../../MemberListItem';
import { SessionButton } from '../../basic/SessionButton';
import { SessionIdEditable } from '../../basic/SessionIdEditable';


import { useSet } from '../../../hooks/useSet';
import { VALIDATION } from '../../../session/constants';
import { createClosedGroup } from '../../../session/conversations/createClosedGroup';
import { ToastUtils } from '../../../session/utils';
import LIBSESSION_CONSTANTS from '../../../session/utils/libsession/libsession_constants';
import { isDevProd } from '../../../shared/env_vars';
import { groupInfoActions } from '../../../state/ducks/metaGroups';
import { clearSearch } from '../../../state/ducks/search';
import { resetLeftOverlayMode } from '../../../state/ducks/section';
import { useContactsToInviteToGroup } from '../../../state/selectors/conversations';
import { useIsCreatingGroupFromUIPending } from '../../../state/selectors/groups';
import {
  getSearchResultsContactOnly,
  getSearchTerm,
  useIsSearching,
} from '../../../state/selectors/search';
import { useOurPkStr } from '../../../state/selectors/user';
import { GroupInviteRequiredVersionBanner } from '../../NoticeBanner';
import { SessionSearchInput } from '../../SessionSearchInput';
import { Flex } from '../../basic/Flex';
import { Localizer } from '../../basic/Localizer';
import { SessionToggle } from '../../basic/SessionToggle';
import { SpacerLG, SpacerMD } from '../../basic/Text';
import { SessionInput } from '../../inputs';
import { StyledLeftPaneOverlay } from './OverlayMessage';
import { Header } from '../../conversation/right-panel/overlay/components';
import { SessionSpinner } from '../../loading';

const StyledMemberListNoContacts = styled.div`
  text-align: center;
  align-self: center;
  padding: 20px;
`;

const StyledNoResults = styled.div`
  width: 100%;
  min-height: 40px;
  max-height: 400px;
  padding: var(--margins-xl) var(--margins-sm);
  text-align: center;
`;

const StyledGroupMemberListContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  overflow-x: hidden;
  overflow-y: auto;

  &::-webkit-scrollbar-track {
    background-color: var(--background-secondary-color);
  }
`;

const NoContacts = () => {
  return (
    <StyledMemberListNoContacts>
      <Localizer token="contactNone" />
    </StyledMemberListNoContacts>
  );
};

/**
 * Makes some validity check and return true if the group was indeed created
 */
async function createClosedGroupWithErrorHandling(
  groupName: string,
  groupMemberIds: Array<string>,
  onError: (error: string) => void
): Promise<boolean> {
  // Validate groupName and groupMembers length
  if (groupName.length === 0) {
    ToastUtils.pushToastError('invalidGroupName', window.i18n.stripped('groupNameEnterPlease'));

    onError(window.i18n('groupNameEnterPlease'));
    return false;
  }
  if (groupName.length > LIBSESSION_CONSTANTS.BASE_GROUP_MAX_NAME_LENGTH) {
    onError(window.i18n('groupNameEnterShorter'));
    return false;
  }

  // >= because we add ourself as a member AFTER this. so a 10 group is already invalid as it will be 11 when we are included
  // the same is valid with groups count < 1

  if (groupMemberIds.length < 1) {
    onError(window.i18n('groupCreateErrorNoMembers'));
    return false;
  }

  if (groupMemberIds.length >= VALIDATION.CLOSED_GROUP_SIZE_LIMIT) {
    onError(window.i18n('groupAddMemberMaximum'));
    return false;
  }

  await createClosedGroup(groupName, groupMemberIds);

  return true;
}

// duplicated form the legacy one below because this one is a lot more tightly linked with redux async thunks logic
export const OverlayClosedGroupV2 = () => {
  const dispatch = useDispatch();
  const us = useOurPkStr();
  const privateContactsPubkeys = useContactsToInviteToGroup();
  const isCreatingGroup = useIsCreatingGroupFromUIPending();
  const [groupName, setGroupName] = useState('');
  const forceUpdate = useUpdate();
  const {
    uniqueValues: members,
    addTo: addToSelected,
    removeFrom: removeFromSelected,
  } = useSet<string>([]);
  const isSearch = useIsSearching();
  const searchResultContactsOnly = useSelector(getSearchResultsContactOnly);

  function closeOverlay() {
    dispatch(resetLeftOverlayMode());
  }

  async function onEnterPressed() {
    if (isCreatingGroup) {
      window?.log?.warn('Closed group creation already in progress');
      return;
    }
    // Validate groupName and groupMembers length
    if (groupName.length === 0) {
      ToastUtils.pushToastError('invalidGroupName', window.i18n('groupNameEnterPlease'));
      return;
    }
    if (groupName.length > LIBSESSION_CONSTANTS.BASE_GROUP_MAX_NAME_LENGTH) {
      ToastUtils.pushToastError('invalidGroupName', window.i18n('groupNameEnterShorter'));
      return;
    }

    // >= because we add ourself as a member AFTER this. so a 10 group is already invalid as it will be 11 with ourself
    // the same is valid with groups count < 1

    if (members.length < 1) {
      ToastUtils.pushToastError('pickClosedGroupMember', window.i18n('groupCreateErrorNoMembers'));
      return;
    }
    if (members.length >= VALIDATION.CLOSED_GROUP_SIZE_LIMIT) {
      ToastUtils.pushToastError('closedGroupMaxSize', window.i18n('groupAddMemberMaximum'));
      return;
    }
    // trigger the add through redux.
    dispatch(
      groupInfoActions.initNewGroupInWrapper({
        members: concat(members, [us]),
        groupName,
        us,
      }) as any
    );
  }

  useKey('Escape', closeOverlay);

  const title = window.i18n('groupCreate');
  const buttonText = window.i18n('create');
  const subtitle = window.i18n('createClosedGroupNamePrompt');

  const noContactsForClosedGroup = privateContactsPubkeys.length === 0;

  const contactsToRender = isSearch ? searchResultContactsOnly : privateContactsPubkeys;

  const disableCreateButton = !members.length && !groupName.length;

  return (
    <div className="module-left-pane-overlay">
      <Header title={title} subtitle={subtitle} />
      <div className="create-group-name-input">
        <SessionIdEditable
          editable={!noContactsForClosedGroup}
          placeholder={window.i18n('groupNameEnter')}
          value={groupName}
          isGroup={true}
          maxLength={LIBSESSION_CONSTANTS.BASE_GROUP_MAX_NAME_LENGTH}
          onChange={setGroupName}
          onPressEnter={onEnterPressed}
          dataTestId="new-closed-group-name"
        />
      </div>
      <SessionSpinner loading={isCreatingGroup} />
      {/* TODO: localize those strings once out releasing those buttons for real */}
      {isDevProd() && (
        <>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            Invite as admin?{'  '}
            <SessionToggle
              active={window.sessionFeatureFlags.useGroupV2InviteAsAdmin}
              onClick={() => {
                window.sessionFeatureFlags.useGroupV2InviteAsAdmin =
                  !window.sessionFeatureFlags.useGroupV2InviteAsAdmin;
                forceUpdate();
              }}
            />
          </span>
        </>
      )}
      <SpacerLG />
      <SessionSearchInput />
      {!noContactsForClosedGroup && window.sessionFeatureFlags.useClosedGroupV2 && (
        <GroupInviteRequiredVersionBanner />
      )}

      <StyledGroupMemberListContainer>
        {noContactsForClosedGroup ? (
          <NoContacts />
        ) : (
          <StyledGroupMemberList className="group-member-list__selection">
            {contactsToRender.map((memberPubkey: string) => (
              <MemberListItem
                pubkey={memberPubkey}
                isSelected={members.some(m => m === memberPubkey)}
                key={memberPubkey}
                onSelect={addToSelected}
                onUnselect={removeFromSelected}
                disableBg={true}
              />
            ))}
          </StyledGroupMemberList>
        )}
      </StyledGroupMemberListContainer>
      <SpacerLG style={{ flexShrink: 0 }} />
      <SessionButton
        text={buttonText}
        disabled={disableCreateButton}
        onClick={onEnterPressed}
        dataTestId="next-button"
        margin="auto 0 var(--margins-lg) 0 " // just to keep that button at the bottom of the overlay (even with an empty list)
      />
    </div>
  );
};

export const OverlayLegacyClosedGroup = () => {
  const dispatch = useDispatch();
  const privateContactsPubkeys = useContactsToInviteToGroup();
  const [groupName, setGroupName] = useState('');
  const [groupNameError, setGroupNameError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const {
    uniqueValues: selectedMemberIds,
    addTo: addToSelected,
    removeFrom: removeFromSelected,
  } = useSet<string>([]);
  const isSearch = useIsSearching();
  const searchTerm = useSelector(getSearchTerm);
  const searchResultContactsOnly = useSelector(getSearchResultsContactOnly);

  function closeOverlay() {
    dispatch(clearSearch());
    dispatch(resetLeftOverlayMode());
  }

  async function onEnterPressed() {
    setGroupNameError(undefined);
    if (loading) {
      window?.log?.warn('Closed group creation already in progress');
      return;
    }
    setLoading(true);
    const groupCreated = await createClosedGroupWithErrorHandling(
      groupName,
      selectedMemberIds,
      setGroupNameError
    );
    if (groupCreated) {
      closeOverlay();
      return;
    }
    setLoading(false);
  }

  useKey('Escape', closeOverlay);

  const contactsToRender = isSearch ? searchResultContactsOnly : privateContactsPubkeys;

  const noContactsForClosedGroup = isEmpty(searchTerm) && contactsToRender.length === 0;

  const disableCreateButton = loading || (!selectedMemberIds.length && !groupName.length);

  return (
    <StyledLeftPaneOverlay
      container={true}
      flexDirection={'column'}
      flexGrow={1}
      alignItems={'center'}
    >
      <Flex
        container={true}
        width={'100%'}
        flexDirection="column"
        alignItems="center"
        padding={'var(--margins-md)'}
      >
        <SessionInput
          autoFocus={true}
          type="text"
          placeholder={window.i18n('groupNameEnter')}
          value={groupName}
          onValueChanged={setGroupName}
          onEnterPressed={onEnterPressed}
          error={groupNameError}
          maxLength={LIBSESSION_CONSTANTS.BASE_GROUP_MAX_NAME_LENGTH}
          textSize="md"
          centerText={true}
          monospaced={true}
          isTextArea={true}
          inputDataTestId="new-closed-group-name"
          editable={!loading}
        />
        <SpacerMD />
        <SessionSpinner loading={loading} />
        <SpacerLG />
      </Flex>

      <SessionSearchInput />
      <StyledGroupMemberListContainer>
        {noContactsForClosedGroup ? (
          <NoContacts />
        ) : searchTerm && !contactsToRender.length ? (
          <StyledNoResults>
            <Localizer token="searchMatchesNoneSpecific" args={{ query: searchTerm }} />
          </StyledNoResults>
        ) : (
          contactsToRender.map((pubkey: string) => (
            <MemberListItem
              key={`member-list-${pubkey}`}
              pubkey={pubkey}
              isSelected={selectedMemberIds.includes(pubkey)}
              onSelect={addToSelected}
              onUnselect={removeFromSelected}
              withBorder={false}
              disabled={loading}
            />
          ))
        )}
      </StyledGroupMemberListContainer>

      <SpacerLG style={{ flexShrink: 0 }} />
      <Flex container={true} width={'100%'} flexDirection="column" padding={'var(--margins-md)'}>
        <SessionButton
          text={window.i18n('create')}
          disabled={disableCreateButton}
          onClick={onEnterPressed}
          dataTestId="next-button"
          margin="auto 0 0" // just to keep that button at the bottom of the overlay (even with an empty list)
        />
      </Flex>
      <SpacerLG />
    </StyledLeftPaneOverlay>
  );
};
