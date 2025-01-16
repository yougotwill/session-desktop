import { ExpirableReadableMessage } from './ExpirableReadableMessage';
import { NotificationBubble } from './notification-bubble/NotificationBubble';
import { Localizer } from '../../../basic/Localizer';
import { useMessageAuthor } from '../../../../state/selectors';
import { useNicknameOrProfileNameOrShortenedPubkey } from '../../../../hooks/useParamSelector';
import type { WithMessageId } from '../../../../session/types/with';

export const DataExtractionNotification = (props: WithMessageId) => {
  const { messageId } = props;
  const author = useMessageAuthor(messageId);
  const authorName = useNicknameOrProfileNameOrShortenedPubkey(author);

  if (!author) {
    return null;
  }

  // Note: we only support one type of data extraction notification now (media saved).
  // the screenshot support is entirely removed.
  return (
    <ExpirableReadableMessage
      messageId={messageId}
      dataTestId="data-extraction-notification"
      key={`readable-message-${messageId}`}
      isControlMessage={true}
    >
      <NotificationBubble iconType="save">
        <Localizer token={'attachmentsMediaSaved'} args={{ name: authorName }} />
      </NotificationBubble>
    </ExpirableReadableMessage>
  );
};
