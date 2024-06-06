import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { getLeftPaneConversationIdsCount } from '../state/selectors/conversations';
import { getTheme } from '../state/selectors/theme';
import { isSignWithRecoveryPhrase } from '../util/storage';
import { Flex } from './basic/Flex';
import { H1, H2, H4, H8 } from './basic/Heading';
import { Spacer2XL, SpacerMD, SpacerXS } from './basic/Text';

const StyledPlaceholder = styled(Flex)`
  background-color: var(--background-secondary-color);
  height: 100%;
`;

const StyledSessionFullLogo = styled(Flex)`
  img:first-child {
    height: 180px;
    filter: brightness(0) saturate(100%) invert(75%) sepia(84%) saturate(3272%) hue-rotate(103deg)
      brightness(106%) contrast(103%);
    -webkit-user-drag: none;
  }

  img:nth-child(2) {
    margin-top: 10px;
    width: 250px;
    transition: 0s;
    filter: var(--session-logo-text-current-filter);
    -webkit-user-drag: none;
  }
`;

const StyledPartyPopper = styled.img`
  height: 180px;
  margin: 0 auto;
  -webkit-user-drag: none;
`;

const StyledHR = styled.hr`
  color: var(--text-secondary-color);
  opacity: 0.5;
  width: 300px;
  border-width: 1px;
  margin: 40px 0 var(--margins-lg);
`;

export const EmptyMessageView = () => {
  const theme = useSelector(getTheme);
  const conversationCount = useSelector(getLeftPaneConversationIdsCount);
  const isSignInWithRecoveryPhrase = isSignWithRecoveryPhrase();

  const launchCount = window.getSettingValue('launch-count');
  const newAccountCreated = !isSignInWithRecoveryPhrase && (!launchCount || launchCount < 1);

  return (
    <StyledPlaceholder
      container={true}
      width={'100%'}
      className="content"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
    >
      {newAccountCreated ? (
        <>
          <StyledPartyPopper src="images/party-popper.svg" alt="party popper emoji" />
          <Spacer2XL />
          <H1 style={{ fontSize: '48px' }}>{window.i18n('onboardingAccountCreated')}</H1>
          <SpacerMD />
          <H2
            color={theme.includes('dark') ? 'var(--primary-color)' : 'var(--text-primary-color)'}
            fontWeight={400}
          >
            {window.i18n('onboardingBubbleWelcomeToSession')}
          </H2>
        </>
      ) : (
        <StyledSessionFullLogo
          container={true}
          className="content"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          margin="0 auto"
        >
          <img src="images/session/brand.svg" alt="full-brand-logo" />
          <img src="images/session/session-text.svg" alt="full-brand-text" />
        </StyledSessionFullLogo>
      )}
      {!conversationCount ? (
        <>
          <StyledHR />
          <H4>{window.i18n('conversationsNone')}</H4>
          <SpacerXS />
          <H8 alignText="center" fontWeight={400} style={{ width: '360px' }}>
            {window.i18n('onboardingHitThePlusButton')}
          </H8>
        </>
      ) : null}
    </StyledPlaceholder>
  );
};
