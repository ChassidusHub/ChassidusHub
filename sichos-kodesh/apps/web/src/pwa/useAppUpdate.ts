import { useSyncExternalStore } from 'react';
import { getChecking, getNeedsRefresh, subscribeAppUpdate } from './appUpdate';

/** Live view of appUpdate.ts's module state - used by AboutScreen's "Update app" section. */
export function useAppUpdate(): { needsRefresh: boolean; checking: boolean } {
  const needsRefresh = useSyncExternalStore(subscribeAppUpdate, getNeedsRefresh);
  const checking = useSyncExternalStore(subscribeAppUpdate, getChecking);
  return { needsRefresh, checking };
}
