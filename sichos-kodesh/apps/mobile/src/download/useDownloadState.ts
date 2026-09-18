import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { useDownload } from './useDownload';
import type { DownloadStatus } from './downloadStorage';
import { isTargetDownloaded } from './downloadStorage';

export function useDownloadState(entry: CatalogEntry | null | undefined): DownloadStatus {
  const { targetStates, getOccasionTargets } = useDownload();
  const [storedStatus, setStoredStatus] = useState<DownloadStatus>('idle');
  const targets = useMemo(() => (entry ? getOccasionTargets(entry, 'manual') : []), [entry, getOccasionTargets]);

  useEffect(() => {
    let cancelled = false;
    if (!entry || targets.length === 0) {
      setStoredStatus('idle');
      return;
    }

    const activeStates = targets
      .map((target) => targetStates[target.key]?.status)
      .filter((status): status is Exclude<DownloadStatus, 'idle'> => !!status && status !== 'idle');

    if (activeStates.includes('downloading')) {
      setStoredStatus('downloading');
      return;
    }
    if (activeStates.includes('queued')) {
      setStoredStatus('queued');
      return;
    }
    if (activeStates.includes('error')) {
      setStoredStatus('error');
      return;
    }

    Promise.all(targets.map(isTargetDownloaded)).then((results) => {
      if (cancelled) return;
      setStoredStatus(results.every(Boolean) ? 'downloaded' : 'idle');
    });

    return () => {
      cancelled = true;
    };
  }, [entry, getOccasionTargets, targetStates, targets]);

  return storedStatus;
}
