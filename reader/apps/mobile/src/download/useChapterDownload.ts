import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@chassidushub-reader/app-core';
import { useDownload } from './useDownload';
import type { RowDownloadState } from './downloadContext';
import { isTargetDownloaded } from './downloadStorage';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useDownloadsCanRun } from './useDownloadsCanRun';

export interface ChapterDownloadState {
  state: RowDownloadState;
  /** Byte-progress (0-1), only meaningful while `state === 'downloading'`. */
  progress: number | undefined;
  download: () => void;
}

/** The farbrengen page's per-chapter download affordance (ChapterList) - independent of the occasion-level `contentTypes` settings: tapping this one chapter's row means "download this chapter." */
export function useChapterDownload(entry: CatalogEntry, chapterIndex: number): ChapterDownloadState {
  const { targetStates, downloadChapter } = useDownload();
  const online = useOnlineStatus();
  const target = useMemo(
    () => listDownloadTargets([entry], ALL_CONTENT_TYPES).find((item) => item.kind === 'audio' && item.chapterIndex === chapterIndex) ?? null,
    [entry, chapterIndex],
  );
  const live = target ? targetStates[target.key] : undefined;
  // While downloads can't run a queued or started file isn't coming (see useDownloadState): only 'downloaded' still answers.
  const canRun = useDownloadsCanRun();
  const liveStatus = !canRun && (live?.status === 'queued' || live?.status === 'downloading') ? undefined : live?.status;
  const liveAnswers = liveStatus === 'queued' || liveStatus === 'downloading' || liveStatus === 'downloaded';
  const [cachedState, setCachedState] = useState<'downloaded' | 'none' | null>(null);

  useEffect(() => {
    if (!target || liveAnswers) return;
    let cancelled = false;
    isTargetDownloaded(target)
      .then((downloaded) => {
        if (!cancelled) setCachedState(downloaded ? 'downloaded' : 'none');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [target, liveAnswers]);

  let state: RowDownloadState;
  if (!target) state = 'unavailable';
  else if (liveStatus === 'queued' || liveStatus === 'downloading' || liveStatus === 'downloaded') state = liveStatus;
  else state = cachedState ?? 'loading';
  if (state === 'none' && !online) state = 'unavailable';

  return {
    state,
    progress: liveStatus === 'downloading' && live && live.progress > 0 ? live.progress : undefined,
    download: () => {
      downloadChapter(entry, chapterIndex).catch(() => undefined);
    },
  };
}
