import { useEffect, useMemo, useState } from 'react';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import type { RowDownloadState } from '../download/downloadContext';
import { isTargetDownloaded } from '../download/downloadStorage';
import { useDownload } from '../download/useDownload';
import { useOnlineStatus } from '../network/useOnlineStatus';

export interface TargetsDownload {
  state: RowDownloadState;
  /** 0-1 while bytes are arriving, like useDownloadProgress. */
  progress: number | undefined;
  start: () => void;
}

/**
 * useDownloadState and useDownloadProgress for any set of targets (a
 * library item's files), not one occasion's: the provider's live state
 * first, then a check of the files on disk, re-run when the download
 * records change.
 */
export function useTargetsDownload(targets: DownloadTarget[]): TargetsDownload {
  const { targetStates, enqueueTargets, downloadedRecords } = useDownload();
  const online = useOnlineStatus();
  const [onDisk, setOnDisk] = useState<boolean | null>(null);
  const keys = targets.map((target) => target.key).join('|');

  const statuses = targets.map((target) => targetStates[target.key]?.status);
  // With no connection a queued or started file isn't coming (see useDownloadState).
  const anyDownloading = online && statuses.includes('downloading');
  const anyQueued = online && statuses.includes('queued');
  const allLiveDownloaded = targets.length > 0 && statuses.every((status) => status === 'downloaded');

  useEffect(() => {
    if (targets.length === 0) return undefined;
    let cancelled = false;
    Promise.all(targets.map(isTargetDownloaded)).then((results) => {
      if (!cancelled) setOnDisk(results.every(Boolean));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the target set; the records change after every finished download or delete.
  }, [keys, downloadedRecords]);

  const progress = useMemo(() => {
    let sum = 0;
    let active = false;
    for (const target of targets) {
      const state = targetStates[target.key];
      if (state?.status === 'downloaded') sum += 1;
      else if (state?.status === 'downloading') {
        active = true;
        sum += state.progress;
      } else if (state?.status === 'queued') active = true;
    }
    return active && sum > 0 && targets.length > 0 ? Math.min(sum / targets.length, 1) : undefined;
  }, [targetStates, targets]);

  let state: RowDownloadState;
  if (targets.length === 0) state = 'unavailable';
  else if (anyDownloading) state = 'downloading';
  else if (anyQueued) state = 'queued';
  else if (allLiveDownloaded || onDisk) state = 'downloaded';
  else if (onDisk === null) state = 'loading';
  else state = online ? 'none' : 'unavailable';

  return {
    state,
    progress,
    start: () => {
      enqueueTargets(targets, 'manual').catch(() => undefined);
    },
  };
}
