import React from 'react';

import { Flex } from '../../../../basic/Flex';
import { Header, StyledScrollContainer } from '../components';

export const OverlayMessageDetails = () => (
  <StyledScrollContainer>
    <Flex container={true} flexDirection={'column'} alignItems={'center'}>
      <Header title={window.i18n('messageInfo')} hideBackButton={true} />
      {/* TODO move in <MessageDetail /> */}
    </Flex>
  </StyledScrollContainer>
);
