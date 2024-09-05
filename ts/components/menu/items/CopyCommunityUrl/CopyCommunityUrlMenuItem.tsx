import { Item } from 'react-contexify';
import { showCopyCommunityUrlMenuItem } from '.';
import { useIsPublic } from '../../../../hooks/useParamSelector';
import { copyPublicKeyByConvoId } from '../../../../interactions/conversationInteractions';
import { Localizer } from '../../../basic/Localizer';

export const CopyCommunityUrlMenuItem = ({ convoId }: { convoId: string }): JSX.Element | null => {
  const isPublic = useIsPublic(convoId);

  // we want to show the copyId for communities only

  if (showCopyCommunityUrlMenuItem({ isPublic })) {
    return (
      <Item
        onClick={() => {
          void copyPublicKeyByConvoId(convoId);
        }}
      >
        <Localizer token="communityUrlCopy" />
      </Item>
    );
  }
  return null;
};
