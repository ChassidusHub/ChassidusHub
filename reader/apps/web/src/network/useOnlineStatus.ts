import { useSyncExternalStore } from 'react';
import { getOnlineSnapshot, subscribeOnline } from './connectivity';

/**
 * Live connectivity status - used by the home screen's offline note, the
 * top-of-page connectivity banner, DownloadedScreen's own reach point from
 * that note, and every download-affordance hook (see useDownloadState.ts
 * and friends). See connectivity.ts for what actually drives this value -
 * real fetch outcomes against services/media-proxy, not a browser event or
 * a background ping.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot);
}
