import { useMemo } from 'react';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { useDownload } from './useDownload';

/**
 * Byte-progress (0-1) for one occasion's own download job -
 * (completed files + the active file's own fraction) / total files - or
 * `undefined` when it isn't actively downloading, or no real byte progress
 * has arrived yet (the row then shows the indeterminate spinner instead).
 */
export function useDownloadProgress(entry: CatalogEntry | null | undefined): number | undefined {
  const { targetStates, getOccasionTargets } = useDownload();
  const targets = useMemo(() => (entry ? getOccasionTargets(entry, 'manual') : []), [entry, getOccasionTargets]);

  if (targets.length === 0) return undefined;
  let sum = 0;
  let anyActive = false;
  let anyBytes = false;
  for (const target of targets) {
    const state = targetStates[target.key];
    if (!state) continue;
    if (state.status === 'downloaded') sum += 1;
    else if (state.status === 'downloading') {
      anyActive = true;
      if (state.progress > 0) anyBytes = true;
      sum += state.progress;
    } else if (state.status === 'queued') anyActive = true;
  }
  if (!anyActive || !anyBytes) return undefined;
  return Math.min(sum / targets.length, 1);
}
