import React from 'react';

import { useDispatch, useSelector } from 'react-redux';
import {
  isMessageSelectionMode,
  useSelectedConversationKey,
} from '../../../state/selectors/conversations';

import { openRightPanel } from '../../../state/ducks/conversations';

import { Flex } from '../../basic/Flex';
import { ConversationHeaderMenu } from '../../menu/ConversationHeaderMenu';
import { AvatarHeader, CallButton, TripleDotsMenu } from './ConversationHeaderItems';
import { SelectionOverlay } from './ConversationHeaderSelectionOverlay';
import { ConversationHeaderTitle } from './ConversationHeaderTitle';
import { resetRightOverlayMode } from '../../../state/ducks/section';

export const ConversationHeaderWithDetails = () => {
  const isSelectionMode = useSelector(isMessageSelectionMode);
  const selectedConvoKey = useSelectedConversationKey();
  const dispatch = useDispatch();

  if (!selectedConvoKey) {
    return null;
  }

  const triggerId = 'conversation-header';

  return (
    <div className="module-conversation-header">
      <div className="conversation-header--items-wrapper">
        <TripleDotsMenu triggerId={triggerId} showBackButton={false} />
        <ConversationHeaderTitle />

        {!isSelectionMode && (
          <Flex
            container={true}
            flexDirection="row"
            alignItems="center"
            flexGrow={0}
            flexShrink={0}
          >
            <CallButton />
            <AvatarHeader
              onAvatarClick={() => {
                dispatch(resetRightOverlayMode());
                dispatch(openRightPanel());
              }}
              pubkey={selectedConvoKey}
              showBackButton={false}
            />
          </Flex>
        )}

        <ConversationHeaderMenu triggerId={triggerId} />
      </div>

      {isSelectionMode && <SelectionOverlay />}
    </div>
  );
};
