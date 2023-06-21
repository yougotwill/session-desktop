import React from 'react';

import { Flex } from '../../../../basic/Flex';
import { Header, HeaderTitle, StyledScrollContainer } from '../components';
import { MessageDetail } from '../../../message/message-item/MessageDetail';

export const OverlayMessageDetails = () => (
  <StyledScrollContainer>
    <Flex container={true} flexDirection={'column'} alignItems={'center'}>
      <Header hideBackButton={true}>
        <HeaderTitle>{window.i18n('messageInfo')}</HeaderTitle>
      </Header>
      <MessageDetail />
    </Flex>
  </StyledScrollContainer>
);
