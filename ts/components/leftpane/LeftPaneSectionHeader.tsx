import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { recoveryPhraseModal } from '../../state/ducks/modalDialog';
import { SectionType } from '../../state/ducks/section';
import { disableRecoveryPhrasePrompt } from '../../state/ducks/userConfig';
import { getFocusedSection, getIsMessageRequestOverlayShown } from '../../state/selectors/section';
import { getTheme } from '../../state/selectors/theme';
import { getShowRecoveryPhrasePrompt } from '../../state/selectors/userConfig';
import { isSignWithRecoveryPhrase } from '../../util/storage';
import { Flex } from '../basic/Flex';
import { H4 } from '../basic/Heading';
import { SessionButton } from '../basic/SessionButton';
import { SpacerMD } from '../basic/Text';
import { MenuButton } from '../buttons';
import { SessionIcon } from '../icon';

const SectionTitle = styled(H4)`
  padding-top: var(--margins-xs);
  padding-left: var(--margins-sm);
  flex-grow: 1;
`;

const StyledProgressBarContainer = styled.div`
  width: 100%;
  height: 5px;
  flex-direction: row;
  background: var(--border-color);
`;

const StyledProgressBarInner = styled.div`
  background: var(--primary-color);
  width: 100%;
  transition: width var(--default-duration) ease-in;
  height: 100%;
`;

const StyledBanner = styled(Flex)`
  p {
    padding: 0;
    margin: 0;
  }

  p:nth-child(2) {
    font-size: var(--font-size-sm);
  }

  .session-button {
    width: 100%;
  }

  svg {
    margin-top: -3px;
    margin-left: var(--margins-xs);
  }
`;

const StyledBannerTitle = styled.p`
  font-size: var(--font-size-lg);
  font-weight: 700;
`;

const StyledLeftPaneBanner = styled.div`
  background: var(--background-secondary-color);
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border-color);
`;

export const LeftPaneBanner = () => {
  const theme = useSelector(getTheme);
  const section = useSelector(getFocusedSection);
  const isSignInWithRecoveryPhrase = isSignWithRecoveryPhrase();

  const dispatch = useDispatch();

  const showRecoveryPhraseModal = () => {
    dispatch(disableRecoveryPhrasePrompt());
    dispatch(recoveryPhraseModal({}));
  };

  if (section !== SectionType.Message || isSignInWithRecoveryPhrase) {
    return null;
  }

  return (
    <StyledLeftPaneBanner>
      <StyledProgressBarContainer>
        <StyledProgressBarInner />
      </StyledProgressBarContainer>
      <StyledBanner
        container={true}
        width={'100%'}
        flexDirection="column"
        alignItems={'flex-start'}
        padding={'var(--margins-md)'}
      >
        <Flex container={true} width={'100%'} alignItems="flex-start">
          <StyledBannerTitle>{window.i18n('saveRecoveryPassword')}</StyledBannerTitle>
          <SessionIcon
            iconType={theme.includes('dark') ? 'recoveryPasswordFill' : 'recoveryPasswordOutline'}
            iconSize="medium"
            iconColor="var(--text-primary-color)"
          />
        </Flex>
        <p>{window.i18n('saveRecoveryPasswordDescription')}</p>
        <SpacerMD />
        <SessionButton
          text={window.i18n('continue')}
          onClick={showRecoveryPhraseModal}
          dataTestId="reveal-recovery-phrase"
        />
      </StyledBanner>
    </StyledLeftPaneBanner>
  );
};

export const LeftPaneSectionHeader = () => {
  const showRecoveryPhrasePrompt = useSelector(getShowRecoveryPhrasePrompt);
  const focusedSection = useSelector(getFocusedSection);
  const isMessageRequestOverlayShown = useSelector(getIsMessageRequestOverlayShown);

  let label: string | undefined;

  const isMessageSection = focusedSection === SectionType.Message;

  switch (focusedSection) {
    case SectionType.Settings:
      label = window.i18n('settingsHeader');
      break;
    case SectionType.Message:
      label = isMessageRequestOverlayShown
        ? window.i18n('messageRequests')
        : window.i18n('messagesHeader');
      break;
    default:
  }

  return (
    <Flex flexDirection="column">
      <div className="module-left-pane__header">
        <SectionTitle color={'--text-primary-color'}>{label}</SectionTitle>
        {isMessageSection && <MenuButton />}
      </div>
      {showRecoveryPhrasePrompt && <LeftPaneBanner />}
    </Flex>
  );
};
