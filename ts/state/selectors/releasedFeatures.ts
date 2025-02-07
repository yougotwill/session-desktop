import { useSelector } from 'react-redux';
import { NetworkTime } from '../../util/NetworkTime';
import {
  LEGACY_GROUP_DEPRECATED_TIMESTAMP_MS,
  START_CREATE_NEW_GROUP_TIMESTAMP_MS,
} from '../ducks/releasedFeatures';

export const areLegacyGroupsDeprecatedYet = (): boolean => {
  const theyAreDeprecated = NetworkTime.now() >= LEGACY_GROUP_DEPRECATED_TIMESTAMP_MS;

  return window.sessionFeatureFlags.forceLegacyGroupsDeprecated || theyAreDeprecated;
};

const areGroupsCreatedAsNewGroupsYet = (): boolean => {
  const shouldCreateNewGroups = NetworkTime.now() >= START_CREATE_NEW_GROUP_TIMESTAMP_MS;

  return window.sessionFeatureFlags.useClosedGroupV2 || shouldCreateNewGroups;
};

export function useAreGroupsCreatedAsNewGroupsYet() {
  return useSelector(areGroupsCreatedAsNewGroupsYet);
}

export function areLegacyGroupsDeprecatedYetOutsideRedux() {
  if (!window.inboxStore) {
    return false;
  }
  return areLegacyGroupsDeprecatedYet();
}
