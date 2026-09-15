import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { isEntryFullyDownloaded, listDownloadTargets, runDownload } from './downloadManager';
import type { DownloadTarget } from './downloadManager';
import { audioUrl } from './download';
import { DownloadContext, chapterKey } from './downloadContext';
import type { RowDownloadState } from './downloadContext';
import { useDownloadSettings } from '../settings/useDownloadSettings';

function key(hebrewYear: number, occasionId: number): string {
  return `${hebrewYear}:${occasionId}`;
}

/** Clears one key from a progress map once its job has settled (done/error) - a stale leftover fraction would otherwise show briefly the next time that same key starts a fresh download. */
function clearProgress(prev: Record<string, number>, k: string): Record<string, number> {
  if (!(k in prev)) return prev;
  const next = { ...prev };
  delete next[k];
  return next;
}

/**
 * The single source of truth for "what's downloading right now," mounted
 * once at the app root (see App.tsx) alongside PlayerProvider, so every
 * occasion row everywhere shares one live view of download state instead
 * of each screen keeping its own out-of-sync copy. Settings live here too,
 * not as a separately-mounted hook per screen, for the same reason: a
 * toggle changed on the Downloads settings screen needs to be visible to
 * whatever this provider does next (the next tap, the next sync-on-open),
 * not just to that one screen's own component instance.
 */
export function DownloadProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useDownloadSettings();
  const [liveState, setLiveState] = useState<Record<string, RowDownloadState>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});

  const runQueue = useCallback(
    (entries: CatalogEntry[]) => {
      const targets = listDownloadTargets(entries, settings.contentTypes);
      if (targets.length === 0) return;

      const entryByKey = new Map(entries.map((entry) => [key(entry.hebrewYear, entry.occasionId), entry]));
      // Tracked per occasion key, not per target - an occasion can need
      // several files (a few chapters, a couple of pdfs), and its own
      // progress fraction is how far through *all* of them this job is,
      // not any single file's own fraction.
      const totalForKey = new Map<string, number>();
      const completedForKey = new Map<string, number>();
      for (const target of targets) {
        const k = key(target.hebrewYear, target.occasionId);
        totalForKey.set(k, (totalForKey.get(k) ?? 0) + 1);
      }
      setLiveState((prev) => {
        const next = { ...prev };
        for (const k of totalForKey.keys()) next[k] = 'queued';
        return next;
      });

      void runDownload(targets, {
        wifiOnly: settings.wifiOnly,
        onEach: (target, event, fraction) => {
          const k = key(target.hebrewYear, target.occasionId);
          const total = totalForKey.get(k) ?? 1;
          // Audio targets also get their own chapter-keyed state, distinct
          // from the occasion-wide aggregate above - this is what makes
          // RecordingsScreen's per-row ring/spinner light up for a chapter
          // whether it's downloading because of its own row's button
          // (downloadChapter) or because the whole occasion/a bulk week
          // download happens to include it - a real reported gap (only the
          // former ever showed anything there before).
          const chapterK = target.kind === 'audio' && target.chapterIndex !== undefined ? chapterKey(target.hebrewYear, target.occasionId, target.chapterIndex) : null;

          if (event === 'downloading') {
            setLiveState((prev) => {
              if (prev[k] === 'downloading' && (!chapterK || prev[chapterK] === 'downloading')) return prev;
              const next = { ...prev, [k]: 'downloading' as const };
              if (chapterK) next[chapterK] = 'downloading';
              return next;
            });
            if (fraction !== undefined) {
              const completed = completedForKey.get(k) ?? 0;
              setProgress((prev) => {
                const next = { ...prev, [k]: Math.min((completed + fraction) / total, 1) };
                if (chapterK) next[chapterK] = fraction;
                return next;
              });
            }
            return;
          }

          // This one target has settled - its own chapter state (if any)
          // reflects that immediately, independent of the rest of the
          // occasion's own files still being in flight.
          if (chapterK) {
            setLiveState((prev) => ({ ...prev, [chapterK]: event === 'error' ? 'none' : 'downloaded' }));
            setProgress((prev) => clearProgress(prev, chapterK));
          }

          const completed = (completedForKey.get(k) ?? 0) + 1;
          completedForKey.set(k, completed);
          setProgress((prev) => ({ ...prev, [k]: Math.min(completed / total, 1) }));
          if (completed < total) return; // Other files for this same occasion are still pending.
          const entry = entryByKey.get(k);
          if (!entry) return;
          // Re-checked against the real cache rather than trusting the
          // event stream alone - one target erroring shouldn't be masked
          // by the rest succeeding, and this is the same definition of
          // "downloaded" the lazy per-row check (useDownloadState) uses.
          void isEntryFullyDownloaded(entry, settings.contentTypes).then((downloaded) => {
            setLiveState((prev) => ({ ...prev, [k]: downloaded ? 'downloaded' : 'none' }));
            setProgress((prev) => clearProgress(prev, k));
          });
        },
      });
    },
    [settings.contentTypes, settings.wifiOnly],
  );

  const downloadOccasion = useCallback((entry: CatalogEntry) => runQueue([entry]), [runQueue]);
  const enqueueBulk = useCallback((entries: CatalogEntry[]) => runQueue(entries), [runQueue]);

  const downloadChapter = useCallback(
    (entry: CatalogEntry, chapterIndex: number) => {
      const chapter = entry.audio[chapterIndex];
      if (!chapter) return;
      const target: DownloadTarget = {
        url: audioUrl(chapter.workerFilename),
        hebrewYear: entry.hebrewYear,
        occasionId: entry.occasionId,
        label: chapter.chapterName ?? `Track ${chapterIndex + 1}`,
        kind: 'audio',
      };
      const k = chapterKey(entry.hebrewYear, entry.occasionId, chapterIndex);
      setLiveState((prev) => ({ ...prev, [k]: 'queued' }));

      void runDownload([target], {
        wifiOnly: settings.wifiOnly,
        onEach: (_target, event, fraction) => {
          if (event === 'downloading') {
            setLiveState((prev) => (prev[k] === 'downloading' ? prev : { ...prev, [k]: 'downloading' }));
            if (fraction !== undefined) setProgress((prev) => ({ ...prev, [k]: fraction }));
            return;
          }
          setLiveState((prev) => ({ ...prev, [k]: event === 'error' ? 'none' : 'downloaded' }));
          setProgress((prev) => clearProgress(prev, k));
        },
      });
    },
    [settings.wifiOnly],
  );

  const value = useMemo(
    () => ({ settings, setSettings, downloadOccasion, enqueueBulk, downloadChapter, liveState, progress }),
    [settings, setSettings, downloadOccasion, enqueueBulk, downloadChapter, liveState, progress],
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}
