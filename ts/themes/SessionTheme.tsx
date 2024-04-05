import { ipcRenderer } from 'electron';

import React from 'react';
import useMount from 'react-use/lib/useMount';
import { createGlobalStyle } from 'styled-components';
import { getOppositeTheme, isThemeMismatched } from '../util/theme';
import { classicDark } from './classicDark';
import { THEME_GLOBALS, declareCSSVariables } from './globals';
import { switchThemeTo } from './switchTheme';

// Defaults to Classic Dark theme
const GlobalStyles = createGlobalStyle`
  body {

  };
`;

export const SessionTheme = ({ children }: { children: any }) => {
  useMount(() => {
    declareCSSVariables(THEME_GLOBALS);
    declareCSSVariables(classicDark);
  });
  return (
    <React.Fragment>
      <GlobalStyles />
      {children}
    </React.Fragment>
  );
};

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
