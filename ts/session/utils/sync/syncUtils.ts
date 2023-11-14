import _ from 'lodash';
import { SignalService } from '../../../protobuf';
import { UserSyncJobDone } from '../../../shims/events';
import { ReleasedFeatures } from '../../../util/releaseFeature';

import { ExpirationTimerUpdateMessage } from '../../messages/outgoing/controlMessage/ExpirationTimerUpdateMessage';
import { MessageRequestResponse } from '../../messages/outgoing/controlMessage/MessageRequestResponse';
import { UnsendMessage } from '../../messages/outgoing/controlMessage/UnsendMessage';
import {
  AttachmentPointerWithUrl,
  PreviewWithAttachmentUrl,
  Quote,
  VisibleMessage,
} from '../../messages/outgoing/visibleMessage/VisibleMessage';
import { UserSync } from '../job_runners/jobs/UserSyncJob';

export const forceSyncConfigurationNowIfNeeded = async (waitForMessageSent = false) => {
  await ReleasedFeatures.checkIsUserConfigFeatureReleased();
  return new Promise(resolve => {
    // if we hang for more than 20sec, force resolve this promise.
    setTimeout(() => {
      resolve(false);
    }, 20000);

    // the UserSync also handles dumping in to the DB if we do not need to push the data, but the dumping needs to be done even before the feature flag is true.
    void UserSync.queueNewJobIfNeeded().catch(e => {
      window.log.warn(
        'forceSyncConfigurationNowIfNeeded scheduling of jobs UserSync.queueNewJobIfNeeded failed with: ',
        e.message
      );
    });

    if (waitForMessageSent) {
      window.Whisper.events.once(UserSyncJobDone, () => {
        resolve(true);
      });
      return;
    }
    resolve(true);
  });
};

const buildSyncVisibleMessage = (
  identifier: string,
  dataMessage: SignalService.DataMessage,
  createAtNetworkTimestamp: number,
  syncTarget: string
) => {
  const body = dataMessage.body || undefined;

  const wrapToUInt8Array = (buffer: any) => {
    if (!buffer) {
      return undefined;
    }
    if (buffer instanceof Uint8Array) {
      // Audio messages are already uint8Array
      return buffer;
    }
    return new Uint8Array(buffer.toArrayBuffer());
  };
  const attachments = (dataMessage.attachments || []).map(attachment => {
    const key = wrapToUInt8Array(attachment.key);
    const digest = wrapToUInt8Array(attachment.digest);

    return {
      ...attachment,
      key,
      digest,
    };
  }) as Array<AttachmentPointerWithUrl>;
  const quote = (dataMessage.quote as Quote) || undefined;
  const preview = (dataMessage.preview as Array<PreviewWithAttachmentUrl>) || [];
  const expireTimer = dataMessage.expireTimer;

  return new VisibleMessage({
    identifier,
    createAtNetworkTimestamp,
    attachments,
    body,
    quote,
    preview,
    syncTarget,
    expireTimer,
  });
};

const buildSyncExpireTimerMessage = (
  identifier: string,
  dataMessage: SignalService.DataMessage,
  createAtNetworkTimestamp: number,
  syncTarget: string
) => {
  const expireTimer = dataMessage.expireTimer;

  return new ExpirationTimerUpdateMessage({
    identifier,
    createAtNetworkTimestamp,
    expireTimer,
    syncTarget,
  });
};

export type SyncMessageType =
  | VisibleMessage
  | ExpirationTimerUpdateMessage
  | MessageRequestResponse
  | UnsendMessage;

export const buildSyncMessage = (
  identifier: string,
  dataMessage: SignalService.DataMessage,
  syncTarget: string,
  sentTimestamp: number
): VisibleMessage | ExpirationTimerUpdateMessage => {
  if (
    (dataMessage as any).constructor.name !== 'DataMessage' &&
    !(dataMessage instanceof SignalService.DataMessage)
  ) {
    window?.log?.warn('buildSyncMessage with something else than a DataMessage');
  }

  if (!sentTimestamp || !_.isNumber(sentTimestamp)) {
    throw new Error('Tried to build a sync message without a sentTimestamp');
  }
  // don't include our profileKey on syncing message. This is to be done through libsession now
  const timestamp = _.toNumber(sentTimestamp);
  if (dataMessage.flags === SignalService.DataMessage.Flags.EXPIRATION_TIMER_UPDATE) {
    return buildSyncExpireTimerMessage(identifier, dataMessage, timestamp, syncTarget);
  }
  return buildSyncVisibleMessage(identifier, dataMessage, timestamp, syncTarget);
};
