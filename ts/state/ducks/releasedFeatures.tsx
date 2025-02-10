import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DURATION } from '../../session/constants';
import { NetworkTime } from '../../util/NetworkTime';

// update this to be when we ship desktop groups REMOVE AFTER QA
const GROUP_DESKTOP_RELEASE = 1767225600 * 1000; // currently  1st Jan 2026

/**
 * 3+7 days after the release of groups (more or less), we force new groups to be created as new groups
 */
const START_CREATE_NEW_GROUP_TIMESTAMP_MS = GROUP_DESKTOP_RELEASE + DURATION.DAYS * 10;

/**
 * 2 weeks after `START_CREATE_NEW_GROUP_TIMESTAMP_MS`, we mark legacy groups readonly
 */
const LEGACY_GROUP_DEPRECATED_TIMESTAMP_MS =
  START_CREATE_NEW_GROUP_TIMESTAMP_MS + DURATION.WEEKS * 2;

export interface ReleasedFeaturesState {
  legacyGroupDeprecationTimestampRefreshAtMs: number;
  canCreateGroupV2: boolean;
  legacyGroupsReadOnly: boolean;
}

export const initialReleasedFeaturesState = {
  legacyGroupDeprecationTimestampRefreshAtMs: Date.now(),
  canCreateGroupV2: Date.now() >= START_CREATE_NEW_GROUP_TIMESTAMP_MS,
  legacyGroupsReadOnly: Date.now() >= LEGACY_GROUP_DEPRECATED_TIMESTAMP_MS,
};

const releasedFeaturesSlice = createSlice({
  name: 'releasedFeatures',
  initialState: initialReleasedFeaturesState,
  reducers: {
    updateLegacyGroupDeprecationTimestampUpdatedAt: (state, action: PayloadAction<number>) => {
      state.legacyGroupDeprecationTimestampRefreshAtMs = action.payload;
      state.canCreateGroupV2 = NetworkTime.now() >= START_CREATE_NEW_GROUP_TIMESTAMP_MS;
      state.legacyGroupsReadOnly = NetworkTime.now() >= LEGACY_GROUP_DEPRECATED_TIMESTAMP_MS;
      return state;
    },
  },
});

const { actions, reducer } = releasedFeaturesSlice;
export const { updateLegacyGroupDeprecationTimestampUpdatedAt } = actions;
export const releasedFeaturesReducer = reducer;
