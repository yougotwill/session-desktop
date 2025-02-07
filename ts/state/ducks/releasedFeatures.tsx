import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DURATION } from '../../session/constants';

// update this to be when we ship desktop groups REMOVE AFTER QA
const GROUP_DESKTOP_RELEASE = 1767225600 * 1000; // currently  Thursday, January 1, 2026 12:00:00 AM

// FIXME update this to the correct timestamp REMOVE AFTER QA
export const START_CREATE_NEW_GROUP_TIMESTAMP_MS = GROUP_DESKTOP_RELEASE + DURATION.WEEKS * 1;

// FIXME update this to the correct timestamp REMOVE AFTER QA
export const LEGACY_GROUP_DEPRECATED_TIMESTAMP_MS = GROUP_DESKTOP_RELEASE + DURATION.WEEKS * 3;

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
