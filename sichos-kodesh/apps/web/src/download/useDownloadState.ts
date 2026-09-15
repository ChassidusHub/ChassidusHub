import { useEffect, useState } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { useDownload } from './useDownload';
import { isEntryFullyDownloaded, listDownloadTargets } from './downloadManager';
import type { RowDownloadState } from './downloadContext';

function key(hebrewYear: number, occasionId: number): string {
  return `${hebrewYear}:${occasionId}`;
}

/**
 * Live download state for one occasion, for the row icon (see
 * OccasionRowIcon) and FarbrengenScreen's own occasion-level indicator. The
 * shared provider's in-memory state wins when present - more current than
 * a cache check mid-download - otherwise this lazily resolves a real Cache
 * Storage check once per mount, the same "read once per row, not one eager
 * global index" approach useProgressMap/OccasionRowIcon already use for
 * listening progress. Accepts `null`/`undefined` (matching
 * `useRecordVisit`'s own convention) so it can be called unconditionally
 * before an early "not found" return, same as every other hook here.
 */
export function useDownloadState(entry: CatalogEntry | null | undefined): RowDownloadState {
  const { liveState, settings } = useDownload();
  const k = entry ? key(entry.hebrewYear, entry.occasionId) : null;
  const live = k ? liveState[k] : undefined;
  const [cachedState, setCachedState] = useState<RowDownloadState | null>(null);

  useEffect(() => {
    if (!entry || live) return; // An active/completed job already knows the real answer.
    if (listDownloadTargets([entry], settings.contentTypes).length === 0) {
      setCachedState('unavailable');
      return;
    }
    let cancelled = false;
    void isEntryFullyDownloaded(entry, settings.contentTypes).then((downloaded) => {
      if (!cancelled) setCachedState(downloaded ? 'downloaded' : 'none');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by occasion identity; re-checking every visible row whenever any content-type toggle changes isn't needed until that row is actually revisited (a fresh mount re-checks anyway).
  }, [k, live]);

  if (!entry) return 'unavailable';
  return live ?? cachedState ?? 'unavailable';
}
