import classNames from 'classnames';
import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';

import { isNumber } from 'lodash';
import { useDisableDrag } from '../../hooks/useDisableDrag';
import { AttachmentType, AttachmentTypeWithPath } from '../../types/Attachment';
import { Spinner } from '../loading';
import { MessageGenericAttachment } from './message/message-content/MessageGenericAttachment';
import { useEncryptedFileFetch } from '../../hooks/useEncryptedFileFetch';
import { useMessageIdFromContext } from '../../contexts/MessageIdContext';
import { useMessageDirection, useMessageSelected } from '../../state/selectors';
import { AriaLabels } from '../../util/hardcodedAriaLabels';

type Props = {
  alt: string;
  attachment: AttachmentTypeWithPath | AttachmentType;
  /** undefined if the message is not visible yet, '' if the attachment is broken */
  url: string | undefined;
  imageBroken?: boolean;

  height?: number | string;
  width?: number | string;

  overlayText?: string;

  closeButton?: boolean;

  darkOverlay?: boolean;
  playIconOverlay?: boolean;
  softCorners: boolean;
  forceSquare?: boolean;
  attachmentIndex?: number;
  highlight?: boolean;

  onClick?: (attachment: AttachmentTypeWithPath | AttachmentType) => void;
  onClickClose?: (attachment: AttachmentTypeWithPath | AttachmentType) => void;
  onError?: () => void;
};

const StyledOverlay = styled.div<Pick<Props, 'darkOverlay' | 'softCorners'>>`
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 1;
  left: 0;
  right: 0;
  background-color: ${props =>
    props.darkOverlay ? 'var(--message-link-preview-background-color)' : 'unset'};
`;
export const Image = (props: Props) => {
  const {
    alt,
    attachment,
    imageBroken,
    closeButton,
    darkOverlay,
    height: _height,
    onClick,
    onClickClose,
    onError,
    overlayText,
    playIconOverlay,
    softCorners,
    forceSquare,
    attachmentIndex,
    highlight,
    url,
    width: _width,
  } = props;

  const messageId = useMessageIdFromContext();
  const dropShadow = useMessageSelected(messageId);
  const direction = useMessageDirection(messageId);

  const disableDrag = useDisableDrag();
  const { loading, urlToLoad, failed } = useEncryptedFileFetch(
    url,
    attachment.contentType,
    false,
    attachment.pending
  );

  const { caption } = attachment || { caption: null };
  // const pending = attachment.pending;
  const [fail, setFail] = useState(false);

  const canClick = onClick && !loading;
  const role = canClick ? 'button' : undefined;
  const width = isNumber(_width) ? `${_width}px` : _width;
  const height = isNumber(_height) ? `${_height}px` : _height;

  const onFail = useCallback(
    (value?: boolean) => {
      const haveFailed = imageBroken || failed || value === true;
      setFail(haveFailed);
      if (haveFailed && onError) {
        onError();
      }
    },
    [failed, imageBroken, onError]
  );

  useEffect(() => {
    if (!loading && (imageBroken || failed)) {
      onFail();
    }
  }, [failed, imageBroken, loading, onFail]);

  window.log.debug(
    `WIP: Image.tsx messageId ${messageId} loading ${loading} pending ${attachment.pending} imageBroken ${imageBroken} failed ${failed} fail ${fail} url ${url}`
  );

  if (!loading && fail) {
    return (
      <MessageGenericAttachment
        attachment={attachment as AttachmentTypeWithPath}
        pending={false}
        highlight={!!highlight}
        selected={!!dropShadow} // dropshadow is selected
        direction={direction}
      />
    );
  }

  return (
    <div
      role={role}
      onClick={(e: any) => {
        if (canClick && onClick) {
          e.stopPropagation();
          onClick(attachment);
        }
      }}
      className={classNames(
        'module-image',
        canClick ? 'module-image__with-click-handler' : null,
        softCorners ? 'module-image--soft-corners' : null
      )}
      style={{
        maxHeight: height,
        maxWidth: width,
        minHeight: height,
        minWidth: width,
        boxShadow: dropShadow ? 'var(--drop-shadow)' : undefined,
      }}
      data-attachmentindex={attachmentIndex}
    >
      {loading ? (
        <div
          className="module-image__loading-placeholder"
          style={{
            maxHeight: height,
            maxWidth: width,
            width,
            height,
            lineHeight: height,
            textAlign: 'center',
          }}
        >
          <Spinner size="normal" />
        </div>
      ) : (
        <>
          <img
            onError={() => {
              window.log.error(`WIP: [useEncryptedFileFetch] img onErrortrigger`);
              onFail(true);
            }}
            className={classNames(
              'module-image__image',
              forceSquare ? 'module-image__image-cover' : ''
            )}
            alt={alt}
            style={{
              maxHeight: height,
              maxWidth: width,
              minHeight: height,
              minWidth: width,
              width: forceSquare ? width : '',
              height: forceSquare ? height : '',
            }}
            src={urlToLoad}
            onDragStart={disableDrag}
          />
          {urlToLoad && (
            <>
              {caption ? (
                <img
                  className="module-image__caption-icon"
                  src="images/caption-shadow.svg"
                  alt={AriaLabels.imageCaptionAlt}
                  onDragStart={disableDrag}
                />
              ) : null}
              <StyledOverlay
                className={classNames(softCorners ? 'module-image--soft-corners' : null)}
                darkOverlay={darkOverlay}
                softCorners={softCorners}
              />
              {closeButton ? (
                <div
                  role="button"
                  onClick={(e: any) => {
                    e.stopPropagation();
                    if (onClickClose) {
                      onClickClose(attachment);
                    }
                  }}
                  className="module-image__close-button"
                />
              ) : null}
              {playIconOverlay ? (
                <div className="module-image__play-overlay__circle">
                  <div className="module-image__play-overlay__icon" />
                </div>
              ) : null}
              {overlayText ? (
                <div className="module-image__text-container" style={{ lineHeight: height }}>
                  {overlayText}
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
};
