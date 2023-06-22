import React from 'react';

import { Flex } from '../../../../basic/Flex';
import { Header, HeaderTitle, StyledScrollContainer } from '../components';
import { MessageDetail } from '../../../message/message-item/MessageDetail';
import { useDispatch } from 'react-redux';
import { closeMessageDetailsView, closeRightPanel } from '../../../../../state/ducks/conversations';
import { resetRightOverlayMode } from '../../../../../state/ducks/section';

export const OverlayMessageInfo = () => {
  const dispatch = useDispatch();

  return (
    <StyledScrollContainer>
      <Flex container={true} flexDirection={'column'} alignItems={'center'}>
        <Header
          hideBackButton={true}
          closeButtonOnClick={() => {
            dispatch(closeRightPanel());
            dispatch(resetRightOverlayMode());
            dispatch(closeMessageDetailsView());
          }}
        >
          <HeaderTitle>{window.i18n('messageInfo')}</HeaderTitle>
        </Header>
        <MessageDetail />
      </Flex>
    </StyledScrollContainer>
  );
};
