import { useSyncExternalStore } from 'react';
import { getOnlineSnapshot, subscribeOnline } from './connectivity';

/** Live connectivity status - see connectivity.ts for what actually drives this value: real fetch outcomes against services/media-proxy, not a background ping. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot);
}
