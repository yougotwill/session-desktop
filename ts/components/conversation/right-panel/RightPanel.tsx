import React, { useEffect, useState } from 'react';

import { useSelector } from 'react-redux';
import { getRightOverlayMode } from '../../../state/selectors/section';
import { ReleasedFeatures } from '../../../util/releaseFeature';
import { OverlayDisappearingMessages } from './overlay/disappearing-messages/OverlayDisappearingMessages';
import { OverlayRightPanelSettings } from './overlay/OverlayRightPanelSettings';
import { OverlayMessageInfo } from './overlay/message-info/OverlayMessageInfo';

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
    <div className="right-panel">
      <ClosableOverlay />
    </div>
  );
};
