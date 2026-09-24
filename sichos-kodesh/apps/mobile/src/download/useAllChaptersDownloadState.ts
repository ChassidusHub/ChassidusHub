import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@sichos-kodesh/app-core';
import { useDownload } from './useDownload';
import { isTargetDownloaded } from './downloadStorage';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useDownloadsCanRun } from './useDownloadsCanRun';

export type AllChaptersDownloadState = 'unavailable' | 'none' | 'downloading' | 'downloaded';

/** The aggregate download state across every chapter of one occasion - RecordingsScreen's own "download all" affordance, audio only, unconditionally. */
export function useAllChaptersDownloadState(entry: CatalogEntry): AllChaptersDownloadState {
  const { targetStates } = useDownload();
  const online = useOnlineStatus();
  const targets = useMemo(() => listDownloadTargets([entry], ALL_CONTENT_TYPES).filter((item) => item.kind === 'audio'), [entry]);
  const [cachedAllDownloaded, setCachedAllDownloaded] = useState<boolean | null>(null);

  const statuses = targets.map((target) => targetStates[target.key]?.status);
  // While downloads can't run nothing is in flight (see useDownloadState).
  const canRun = useDownloadsCanRun();
  const anyInFlight = canRun && statuses.some((status) => status === 'queued' || status === 'downloading');
  const allLiveDownloaded = targets.length > 0 && statuses.every((status) => status === 'downloaded');

  useEffect(() => {
    if (anyInFlight || allLiveDownloaded || targets.length === 0) return;
    let cancelled = false;
    Promise.all(targets.map(isTargetDownloaded))
      .then((results) => {
        if (!cancelled) setCachedAllDownloaded(results.every(Boolean));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [targets, anyInFlight, allLiveDownloaded]);

  if (targets.length === 0) return 'unavailable';
  if (anyInFlight) return 'downloading';
  if (allLiveDownloaded || cachedAllDownloaded) return 'downloaded';
  return online ? 'none' : 'unavailable';
}
