import React, { useEffect, useState } from 'react';

import { useSelector } from 'react-redux';
import { getRightOverlayMode } from '../../../state/selectors/section';
import { ReleasedFeatures } from '../../../util/releaseFeature';
import { OverlayDisappearingMessages } from './overlay/disappearing-messages/OverlayDisappearingMessages';
import { OverlayRightPanelSettings } from './overlay/OverlayRightPanelSettings';
import { OverlayMessageInfo } from './overlay/message-info/OverlayMessageInfo';
import styled from 'styled-components';
import { Flex } from '../../basic/Flex';

const StyledRightPanel = styled(Flex)`
  h2 {
    word-break: break-word;
  }

  .description {
    margin: var(--margins-md) 0;
    min-height: 4rem;
    width: inherit;
    color: var(--text-secondary-color);
    text-align: center;
    display: none;
  }

  // no double border (top and bottom) between two elements
  &-item + &-item {
    border-top: none;
  }

  .module-empty-state {
    text-align: center;
  }

  .module-attachment-section__items {
    &-media {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      width: 100%;
    }

    &-documents {
      width: 100%;
    }
  }

  .module-media {
    &-gallery {
      &__tab-container {
        padding-top: 1rem;
      }

      &__tab {
        color: var(--text-primary-color);
        font-weight: bold;
        font-size: 0.9rem;
        padding: 0.6rem;
        opacity: 0.8;

        &--active {
          border-bottom: none;
          opacity: 1;

          &:after {
            content: ''; /* This is necessary for the pseudo element to work. */
            display: block;
            margin: 0 auto;
            width: 70%;
            padding-top: 0.5rem;
            border-bottom: 4px solid var(--primary-color);
          }
        }
      }

      &__content {
        padding: var(--margins-xs);
        margin-bottom: 1vh;

        .module-media-grid-item__image,
        .module-media-grid-item {
          height: calc(
            var(--right-panel-width) / 4
          ); //.right-panel is var(--right-panel-width) and we want three rows with some space so divide it by 4
          width: calc(
            var(--right-panel-width) / 4
          ); //.right-panel is var(--right-panel-width) and we want three rows with some space so divide it by 4
          margin: auto;
        }
      }
    }
  }
`;

const ClosableOverlay = () => {
  const rightOverlayMode = useSelector(getRightOverlayMode);
  // TODO we can probably use the ReleasedFeatures.isDisappearMessageV2FeatureReleased instead here so we can remove the state.
  const [showNewDisappearingMessageModes, setShowNewDisappearingMessageModes] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    ReleasedFeatures.checkIsDisappearMessageV2FeatureReleased()
      .then(result => {
        if (isCancelled) {
          return;
        }
        setShowNewDisappearingMessageModes(result);
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  switch (rightOverlayMode?.type) {
    case 'disappearing_messages':
      // TODO legacy messages support will be removed in a future release
      return <OverlayDisappearingMessages unlockNewModes={showNewDisappearingMessageModes} />;
    case 'message_info':
      return <OverlayMessageInfo />;
    case 'default':
    default:
      return <OverlayRightPanelSettings />;
  }
};

export const RightPanel = () => {
  return (
    <StyledRightPanel
      container={true}
      flexDirection={'column'}
      alignItems={'center'}
      width={'var(--right-panel-width)'}
      height={'var(--right-panel-height)'}
      className="right-panel"
    >
      <ClosableOverlay />
    </StyledRightPanel>
  );
};
