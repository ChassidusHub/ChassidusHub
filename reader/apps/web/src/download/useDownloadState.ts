import { useEffect, useState } from 'react';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { useDownload } from './useDownload';
import { isEntryFullyDownloaded, listDownloadTargets } from './downloadManager';
import type { RowDownloadState } from './downloadContext';
import { useOnlineStatus } from '../network/useOnlineStatus';

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
  const online = useOnlineStatus();
  const k = entry ? key(entry.hebrewYear, entry.occasionId) : null;
  const live = k ? liveState[k] : undefined;
  // A synchronous, pure computation (no Cache Storage involved) - resolved
  // on every render rather than inside the effect below, so a genuinely
  // unavailable row (nothing this occasion has matches the current content
  // types) knows that immediately, without waiting on the same async cache
  // check a row that actually might be downloadable needs.
  const hasTargets = entry ? listDownloadTargets([entry], settings.contentTypes).length > 0 : false;
  const [cachedState, setCachedState] = useState<RowDownloadState | null>(null);

  useEffect(() => {
    if (!entry || live || !hasTargets) return; // An active/completed job already knows the real answer; nothing to check for an unavailable row.
    let cancelled = false;
    void isEntryFullyDownloaded(entry, settings.contentTypes).then((downloaded) => {
      if (!cancelled) setCachedState(downloaded ? 'downloaded' : 'none');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by occasion identity; re-checking every visible row whenever any content-type toggle changes isn't needed until that row is actually revisited (a fresh mount re-checks anyway).
  }, [k, live, hasTargets]);

  if (!entry || !hasTargets) return 'unavailable';
  // Genuinely still resolving (see `hasTargets` above and its own comment)
  // rather than "nothing to show" - OccasionRowIcon renders a quiet
  // placeholder for this, not a real icon that then has to visibly pop in
  // as soon as the cache check settles a moment later.
  const resolved = live ?? cachedState ?? 'loading';
  // A tappable "start a download" affordance is pointless while offline -
  // it would just fail (or get stuck) the moment it's tapped. An in-flight
  // or already-finished job (`'queued'`, `'downloading'`, `'downloaded'`)
  // is left exactly as-is: those already reflect real state, not an
  // action still waiting to be taken.
  if (resolved === 'none' && !online) return 'unavailable';
  return resolved;
}
