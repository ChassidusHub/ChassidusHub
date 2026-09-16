import { useEffect, useState } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { useDownload } from './useDownload';
import { chapterKey } from './downloadContext';
import type { RowDownloadState } from './downloadContext';
import { audioUrl } from './download';
import { isDownloaded } from './downloadManager';
import { useOnlineStatus } from '../network/useOnlineStatus';

export interface ChapterDownloadState {
  state: RowDownloadState;
  /** Byte-progress (0-1), only meaningful while `state === 'downloading'`. */
  progress: number | undefined;
  download: () => void;
}

/**
 * RecordingsScreen's own per-chapter download affordance - independent of
 * the occasion-level `contentTypes` settings (tapping this one chapter's
 * row means "download this chapter," regardless of what the Downloads
 * settings screen happens to have enabled), and keyed distinctly from
 * occasion-level state (see `chapterKey`) so it never conflicts with a
 * whole-occasion download running for the same farbrengen. Mirrors
 * `useDownloadState`'s own "live state wins, otherwise lazily check the
 * real cache once" shape.
 */
export function useChapterDownload(entry: CatalogEntry, chapterIndex: number): ChapterDownloadState {
  const { liveState, progress, downloadChapter } = useDownload();
  const online = useOnlineStatus();
  const k = chapterKey(entry.hebrewYear, entry.occasionId, chapterIndex);
  const live = liveState[k];
  const [cachedState, setCachedState] = useState<RowDownloadState | null>(null);

  useEffect(() => {
    if (live) return; // An active/completed job in this session already knows the real answer.
    const chapter = entry.audio[chapterIndex];
    if (!chapter) return;
    let cancelled = false;
    void isDownloaded({ url: audioUrl(chapter.workerFilename) }).then((downloaded) => {
      if (!cancelled) setCachedState(downloaded ? 'downloaded' : 'none');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by chapter identity; re-checking on every render isn't needed until this row is revisited (a fresh mount re-checks anyway).
  }, [k, live]);

  // 'loading' (not 'none') while the real cache check above is still in
  // flight - see useDownloadState's matching comment: 'none' would show a
  // real "start a download" affordance that could immediately have to flip
  // to 'downloaded' a moment later if the chapter turns out to already be
  // cached, which reads as more broken than a brief, honest placeholder.
  const resolved = live ?? cachedState ?? 'loading';
  // See useDownloadState's matching comment - a tappable "start a download"
  // affordance is pointless while offline.
  const state = resolved === 'none' && !online ? 'unavailable' : resolved;

  return {
    state,
    progress: progress[k],
    download: () => downloadChapter(entry, chapterIndex),
  };
}
