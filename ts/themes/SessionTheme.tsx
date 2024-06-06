import { ipcRenderer } from 'electron';

import { ReactNode } from 'react';
import { createGlobalStyle } from 'styled-components';
import { getOppositeTheme, isThemeMismatched } from '../util/theme';
import { classicDark } from './classicDark';
import { THEME_GLOBALS, declareCSSVariables } from './globals';
import { switchThemeTo } from './switchTheme';

// Defaults to Classic Dark theme
const SessionGlobalStyles = createGlobalStyle`
html {
  ${declareCSSVariables(THEME_GLOBALS)}
  ${declareCSSVariables(classicDark)}

  height: 100%;
  -webkit-font-smoothing: antialiased;
  line-height: var(--font-line-height);
  font-size: var(--font-size-md);
  font-family: var(--font-default);
  /* TODO Check on other platforms */
  /* this compensates for antialiasing to match the original design */
  font-weight: 600;
  /* NOTE if we add other variable fonts this might be a problem. We will need to make font-family specific classes and apply them */
  font-stretch: 85%;
  font-optical-sizing: none;
}

body {
  position: relative;
  height: 100%;
  width: 100%;
  margin: 0;
}
`;

export const SessionTheme = ({ children }: { children: ReactNode }) => (
  <>
    <SessionGlobalStyles />
    {children}
  </>
);

export async function ensureThemeConsistency(): Promise<boolean> {
  const theme = window.Events.getThemeSetting();

  return new Promise(resolve => {
    ipcRenderer.send('get-native-theme');
    ipcRenderer.once('send-native-theme', (_, shouldUseDarkColors) => {
      const isMismatchedTheme = isThemeMismatched(theme, shouldUseDarkColors);
      if (isMismatchedTheme) {
        const newTheme = getOppositeTheme(theme);
        void switchThemeTo({
          theme: newTheme,
          mainWindow: true,
          usePrimaryColor: true,
          dispatch: window?.inboxStore?.dispatch,
        });
        resolve(true); // Theme was switched
      } else {
        resolve(false); // Theme was not switched
      }
    });
  });
}
