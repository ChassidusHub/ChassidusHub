import { useEffect, useState } from 'react';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { useDownload } from './useDownload';
import { chapterKey } from './downloadContext';
import { isDownloaded } from './downloadManager';
import { audioUrl } from './download';
import { useOnlineStatus } from '../network/useOnlineStatus';

/** `'unavailable'` - offline right now, so there's nothing tappable to offer - is distinct from `'none'` the same way `RowDownloadState`'s own `'unavailable'` is (see downloadContext.ts): a row with nothing to offer shows no icon at all instead of a dead tap target. */
export type AllChaptersDownloadState = 'unavailable' | 'none' | 'downloading' | 'downloaded';

/**
 * The aggregate download state across every chapter of one occasion -
 * a library item's "download all" (DownloadAllChapters), independent of the
 * occasion-level state FarbrengenScreen tracks (that one also covers PDFs,
 * gated by the settings' content types; this page is audio, unconditionally
 * - see `downloadAllChapters`). Mirrors the live-state-wins,
 * otherwise-lazily-check-the-cache-once shape every other download hook
 * here already uses.
 */
export function useAllChaptersDownloadState(entry: CatalogEntry): AllChaptersDownloadState {
  const { liveState } = useDownload();
  const online = useOnlineStatus();
  const [cachedAllDownloaded, setCachedAllDownloaded] = useState<boolean | null>(null);

  const keys = entry.audio.map((_, index) => chapterKey(entry.hebrewYear, entry.occasionId, index));
  const anyInFlight = keys.some((k) => liveState[k] === 'queued' || liveState[k] === 'downloading');
  const allLiveDownloaded = keys.length > 0 && keys.every((k) => liveState[k] === 'downloaded');

  useEffect(() => {
    if (anyInFlight || allLiveDownloaded || entry.audio.length === 0) return;
    let cancelled = false;
    void Promise.all(entry.audio.map((chapter) => isDownloaded({ url: audioUrl(chapter.workerFilename) }))).then((results) => {
      if (!cancelled) setCachedAllDownloaded(results.every(Boolean));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by occasion identity via entry.hebrewYear/occasionId (entry itself is a stable catalog object); re-checking every render isn't needed until this page is actually revisited.
  }, [entry.hebrewYear, entry.occasionId, anyInFlight, allLiveDownloaded]);

  if (anyInFlight) return 'downloading';
  if (allLiveDownloaded || cachedAllDownloaded) return 'downloaded';
  // See useDownloadState's matching comment - a tappable "download all"
  // affordance is pointless while offline.
  return online ? 'none' : 'unavailable';
}
