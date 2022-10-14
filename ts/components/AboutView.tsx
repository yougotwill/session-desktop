import React, { useEffect } from 'react';
import styled from 'styled-components';
import { switchThemeTo } from '../themes/switchTheme';
import { SessionTheme } from '../themes/SessionTheme';
import { SessionWindow } from './SessionWindow';

const StyledContent = styled.div`
  background-color: var(--background-primary-color);
  color: var(--text-primary-color);
  text-align: center;

  font-family: var(--font-default);
  font-size: 14px;
  height: var(--app-height);
  width: 100%;

  img {
    padding: 12px;
    margin-top: 1em;
  }

  a {
    color: var(--text-primary-color);
  }
`;

export const AboutView = () => {
  // Add debugging metadata - environment if not production, app instance name
  const states = [];

  if (window.getEnvironment() !== 'production') {
    states.push(window.getEnvironment());
  }
  if (window.getAppInstance()) {
    states.push(window.getAppInstance());
  }

  useEffect(() => {
    if ((window as any).theme) {
      void switchThemeTo({
        theme: (window as any).theme,
      });
    }
  }, [(window as any).theme]);

  return (
    <SessionTheme>
      <SessionWindow>
        <StyledContent>
          <img src="images/session/session_icon.png" width="250" height="250" alt="session icon" />

          <div className="version">{`v${window.getVersion()}`}</div>
          <div className="commitHash">{window.getCommitHash() || ''}</div>
          <div className="environment">{states.join(' - ')}</div>
          <div>
            <a href="https://getsession.org">getsession.org</a>
          </div>
          <br />
          <div>
            <a className="privacy" href="https://getsession.org/privacy-policy">
              Privacy Policy
            </a>
            <br />
            <a className="privacy" href="https://getsession.org/terms-of-service/">
              Terms of Service
            </a>
          </div>
        </StyledContent>
      </SessionWindow>
    </SessionTheme>
  );
};
