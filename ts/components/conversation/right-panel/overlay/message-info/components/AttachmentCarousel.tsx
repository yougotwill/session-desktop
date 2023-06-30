import React from 'react';
import { Image } from '../../../../Image';
import { isEmpty } from 'lodash';
import { getAlt, getThumbnailUrl, isVideoAttachment } from '../../../../../../types/Attachment';
import { showLightboxFromAttachmentProps } from '../../../../message/message-content/MessageAttachment';
import { SessionIconButton } from '../../../../../icon';
import { Flex } from '../../../../../basic/Flex';

const CarouselButton = (props: { visible: boolean; rotation: number; onClick: () => void }) => {
  return (
    <SessionIconButton
      iconSize={'huge'}
      iconType="chevron"
      iconRotation={props.rotation}
      onClick={props.onClick}
      iconPadding={'var(--margins-xs)'}
      style={{
        visibility: props.visible ? 'visible' : 'hidden',
      }}
    />
  );
};

type Props = {
  messageId: string;
  attachments: any[];
  visibleIndex: number;
  nextAction: () => void;
  previousAction: () => void;
};

export const AttachmentCarousel = (props: Props) => {
  const { messageId, attachments, visibleIndex, nextAction, previousAction } = props;

  if (isEmpty(attachments)) {
    window.log.debug('No attachments to render in carousel');
    return null;
  }

  const isVideo = isVideoAttachment(attachments[visibleIndex]);

  const showLightbox = () => {
    void showLightboxFromAttachmentProps(messageId, attachments[visibleIndex]);
  };

  // TODO error handling

  return (
    <Flex container={true} flexDirection={'row'} justifyContent={'center'} alignItems={'center'}>
      <CarouselButton visible={visibleIndex > 0} onClick={previousAction} rotation={90} />
      <Image
        alt={getAlt(attachments[visibleIndex])}
        attachment={attachments[visibleIndex]}
        playIconOverlay={isVideo}
        height={300}
        width={300}
        url={getThumbnailUrl(attachments[visibleIndex])}
        attachmentIndex={0}
        softCorners={true}
        // TODO move onto full screen button
        onClick={showLightbox}
      />
      <CarouselButton
        visible={visibleIndex < attachments.length - 1}
        onClick={nextAction}
        rotation={270}
      />
    </Flex>
  );
};
