import { configureStore } from '@reduxjs/toolkit';
import themeReducer from './ducks/theme';

export const themeStore = configureStore({
  reducer: { theme: themeReducer },
});

export type ThemeStoreState = ReturnType<typeof themeStore.getState>;
export type ThemeStoreDispatch = typeof themeStore.dispatch;
