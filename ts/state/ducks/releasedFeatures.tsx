import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export const LEGACY_GROUP_DEPRECATED_TIMESTAMP_MS = Date.now() + 10 * 1000;

export interface ReleasedFeaturesState {
  legacyGroupDeprecationTimestampRefreshAtMs: number;
}

export const initialReleasedFeaturesState = {
  legacyGroupDeprecationTimestampRefreshAtMs: Date.now(),
};

const releasedFeaturesSlice = createSlice({
  name: 'releasedFeatures',
  initialState: initialReleasedFeaturesState,
  reducers: {
    updateLegacyGroupDeprecationTimestampUpdatedAt: (state, action: PayloadAction<number>) => {
      state.legacyGroupDeprecationTimestampRefreshAtMs = action.payload;
    },
  },
});

const { actions, reducer } = releasedFeaturesSlice;
export const { updateLegacyGroupDeprecationTimestampUpdatedAt } = actions;
export const releasedFeaturesReducer = reducer;
