import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface DebugState {
  debugMode: boolean;
}

export const initialDebugState = {
  debugMode: false,
};

const debugSlice = createSlice({
  name: 'debug',
  initialState: initialDebugState,
  reducers: {
    setDebugMode: (state, action: PayloadAction<boolean>) => {
      (window as Window).sessionFeatureFlags.debug.debugLogging = action.payload;
      return { ...state, debugMode: action.payload };
    },
  },
});

const { actions, reducer } = debugSlice;
export const { setDebugMode } = actions;
export const debugReducer = reducer;
