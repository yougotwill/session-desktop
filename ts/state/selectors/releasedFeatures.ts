import { useSelector } from 'react-redux';
import { NetworkTime } from '../../util/NetworkTime';
import { LEGACY_GROUP_DEPRECATED_TIMESTAMP_MS } from '../ducks/releasedFeatures';


export const areLegacyGroupsDeprecatedYet = (): boolean => {
  const theyAreDeprecated = NetworkTime.now() >= LEGACY_GROUP_DEPRECATED_TIMESTAMP_MS;

  return window.sessionFeatureFlags.forceLegacyGroupsDeprecated || theyAreDeprecated;
};

export function areLegacyGroupsDeprecatedYetOutsideRedux() {
  if (!window.inboxStore) {
    return false;
  }
  return areLegacyGroupsDeprecatedYet();
}

export function useAreLegacyGroupsDeprecatedYet() {
  return useSelector(areLegacyGroupsDeprecatedYet);
}
