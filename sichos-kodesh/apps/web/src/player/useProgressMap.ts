import { useEffect, useState } from 'react';
import { readProgressMap, subscribeToProgressChanges } from './progressStore';
import type { ProgressStore } from './progressStore';

/**
 * Reads the listening-progress store on mount, then stays live for as
 * long as the component using it stays mounted - shared by every occasion
 * list so a long list (YearBrowserScreen can run 60+ rows) does one
 * localStorage read per *change*, not one per row per render. Re-reading
 * only on an actual write (via `subscribeToProgressChanges`), not on a
 * timer, is what makes a screen that stays open during playback (the
 * recordings/playlist page, most visibly) actually reflect progress as it
 * happens instead of freezing at whatever existed the moment it mounted.
 */
export function useProgressMap(): ProgressStore {
  const [map, setMap] = useState(readProgressMap);
  useEffect(() => subscribeToProgressChanges(() => setMap(readProgressMap())), []);
  return map;
}
