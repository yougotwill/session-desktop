import classNames from 'classnames';
import styled from 'styled-components';
import { PropsForAttachment } from '../../../../state/ducks/conversations';
import { AttachmentTypeWithPath, getExtensionForDisplay } from '../../../../types/Attachment';
import { Spinner } from '../../../loading';
import { MessageModelType } from '../../../../models/messageType';
import { MessageHighlighter } from './MessageHighlighter';

const StyledGenericAttachmentContainer = styled(MessageHighlighter)<{
  highlight: boolean;
  selected: boolean;
}>`
  ${props => props.selected && 'box-shadow: var(--drop-shadow);'}
`;

export function MessageGenericAttachment({
  attachment,
  direction,
  highlight,
  selected,
  onClick,
}: {
  attachment: PropsForAttachment | AttachmentTypeWithPath;
  highlight: boolean;
  selected: boolean;
  direction?: MessageModelType;
  onClick?: (e: any) => void;
}) {
  // TODO add higher level pending or loading states
  const { pending, fileName, fileSize, contentType } = attachment;
  const extension = getExtensionForDisplay({ contentType, fileName });

  return (
    <StyledGenericAttachmentContainer
      highlight={highlight}
      selected={selected}
      className={'module-message__generic-attachment'}
      onClick={onClick}
    >
      {pending ? (
        <div className="module-message__generic-attachment__spinner-container">
          <Spinner size="small" />
        </div>
      ) : (
        <div className="module-message__generic-attachment__icon-container">
          <div role="button" className="module-message__generic-attachment__icon">
            {extension ? (
              <div className="module-message__generic-attachment__icon__extension">{extension}</div>
            ) : null}
          </div>
        </div>
      )}
      <div className="module-message__generic-attachment__text">
        <div
          className={classNames(
            'module-message__generic-attachment__file-name',
            `module-message__generic-attachment__file-name--${direction}`
          )}
        >
          {fileName}
        </div>
        <div
          className={classNames(
            'module-message__generic-attachment__file-size',
            `module-message__generic-attachment__file-size--${direction}`
          )}
        >
          {fileSize}
        </div>
      </div>
    </StyledGenericAttachmentContainer>
  );
}
