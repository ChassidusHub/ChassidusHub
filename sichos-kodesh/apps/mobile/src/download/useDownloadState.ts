import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { useDownload } from './useDownload';
import type { RowDownloadState } from './downloadContext';
import { isTargetDownloaded } from './downloadStorage';
import { useOnlineStatus } from '../network/useOnlineStatus';

/**
 * Live download state for one occasion, for the row icon (see
 * OccasionRowIcon) and FarbrengenScreen's own occasion-level indicator. The
 * provider's in-memory state wins when present - more current than an
 * on-disk check mid-download - otherwise this lazily resolves a real file
 * check once per mount. Accepts `null`/`undefined` so it can be called
 * unconditionally before an early "not found" return.
 */
export function useDownloadState(entry: CatalogEntry | null | undefined): RowDownloadState {
  const { targetStates, getOccasionTargets } = useDownload();
  const online = useOnlineStatus();
  const targets = useMemo(() => (entry ? getOccasionTargets(entry, 'manual') : []), [entry, getOccasionTargets]);
  const [cachedState, setCachedState] = useState<'downloaded' | 'none' | null>(null);

  const statuses = targets.map((target) => targetStates[target.key]?.status);
  const anyDownloading = statuses.includes('downloading');
  const anyQueued = statuses.includes('queued');
  const allLiveDownloaded = targets.length > 0 && statuses.every((status) => status === 'downloaded');
  const live = anyDownloading || anyQueued || allLiveDownloaded;
  const targetKeys = targets.map((target) => target.key).join('|');

  useEffect(() => {
    if (!entry || targets.length === 0 || live) return;
    let cancelled = false;
    setCachedState(null);
    Promise.all(targets.map(isTargetDownloaded)).then((results) => {
      if (!cancelled) setCachedState(results.every(Boolean) ? 'downloaded' : 'none');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the occasion's target set and whether live state already answers; a fresh mount re-checks anyway.
  }, [targetKeys, live]);

  if (!entry || targets.length === 0) return 'unavailable';
  if (anyDownloading) return 'downloading';
  if (anyQueued) return 'queued';
  if (allLiveDownloaded) return 'downloaded';
  const resolved: RowDownloadState = cachedState ?? 'loading';
  // A tappable "start a download" affordance is pointless while offline.
  if (resolved === 'none' && !online) return 'unavailable';
  return resolved;
}
