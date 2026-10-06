import { useSyncExternalStore } from 'react';
import { readProgressMap, subscribeToProgressChanges } from './progressStore';
import type { ProgressStore } from './progressStore';

/** The listening-progress store, live: re-renders on every write (via `subscribeToProgressChanges`), so a screen that stays open during playback reflects progress as it happens. Shared by every occasion list, read once per screen and passed down to each row. */
export function useProgressMap(): ProgressStore {
  return useSyncExternalStore(subscribeToProgressChanges, readProgressMap);
}
