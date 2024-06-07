import { ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { closeRightPanel } from '../../../../../state/ducks/conversations';
import { resetRightOverlayMode } from '../../../../../state/ducks/section';
import { Flex } from '../../../../basic/Flex';
import { H4, H5, HeadingProps } from '../../../../basic/Heading';
import { SessionIconButton } from '../../../../icon';

export const HeaderTitle = (props: HeadingProps) => (
  <H4 {...props} alignText="center" style={{ wordBreak: 'break-word' }} />
);

export const HeaderSubtitle = (props: HeadingProps) => (
  <H5 {...props} alignText="center" style={{ fontSize: 'var(--font-size-xs)' }} />
);

type HeaderProps = {
  hideBackButton?: boolean;
  backButtonDirection?: 'left' | 'right';
  backButtonOnClick?: () => void;
  hideCloseButton?: boolean;
  closeButtonOnClick?: () => void;
  children?: ReactNode;
};

export const Header = (props: HeaderProps) => {
  const {
    children,
    hideBackButton = false,
    backButtonDirection = 'left',
    backButtonOnClick,
    hideCloseButton = false,
    closeButtonOnClick,
  } = props;
  const dispatch = useDispatch();

  return (
    <Flex container={true} width={'100%'} padding={'32px var(--margins-lg)'}>
      {!hideBackButton && (
        <SessionIconButton
          iconSize={'medium'}
          iconType={'chevron'}
          iconRotation={backButtonDirection === 'left' ? 90 : 270}
          onClick={() => {
            if (backButtonOnClick) {
              backButtonOnClick();
            } else {
              dispatch(resetRightOverlayMode());
            }
          }}
          dataTestId="back-button-conversation-options"
        />
      )}
      <Flex
        container={true}
        flexDirection={'column'}
        justifyContent={'flex-start'}
        alignItems={'center'}
        width={'100%'}
        margin={'-5px auto auto'}
      >
        {children}
      </Flex>
      {!hideCloseButton && (
        <SessionIconButton
          iconSize={'tiny'}
          iconType={'exit'}
          onClick={() => {
            if (closeButtonOnClick) {
              closeButtonOnClick();
            } else {
              dispatch(closeRightPanel());
              dispatch(resetRightOverlayMode());
            }
          }}
        />
      )}
    </Flex>
  );
};
