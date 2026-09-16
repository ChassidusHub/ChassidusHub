import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { isDownloaded, isEntryFullyDownloaded, listDownloadTargets, runDownload } from './downloadManager';
import type { DownloadTarget } from './downloadManager';
import { audioUrl } from './download';
import { DownloadContext, chapterKey } from './downloadContext';
import type { RowDownloadState } from './downloadContext';
import { addPendingChapterDownload, listPendingChapterDownloads, removePendingChapterDownload } from './pendingDownloads';
import { forgetAutoDownload, recordAutoDownload } from './downloadLedger';
import { useDownloadSettings } from '../settings/useDownloadSettings';
import catalog from '../catalog/data';

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
    (entries: CatalogEntry[], source: 'auto' | 'manual') => {
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
          // download happens to include it.
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

          // This one target has settled - record/release its auto-download
          // ledger entry accordingly (see downloadLedger.ts and
          // pruneAutoDownloads.ts): a 'manual' job (a row's own tap, or the
          // "download this week/month" buttons) permanently exempts this
          // URL from ever being auto-pruned, even if it happened to be
          // auto-tracked before; an 'auto' job (the sync-on-open) records
          // or refreshes it. Only on success - an errored fetch never
          // actually landed anything in the cache worth tracking either way.
          if (event === 'done') {
            if (source === 'auto') recordAutoDownload(target.url, target.hebrewYear, target.occasionId);
            else forgetAutoDownload(target.url);
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

  const downloadOccasion = useCallback((entry: CatalogEntry) => runQueue([entry], 'manual'), [runQueue]);
  const enqueueBulk = useCallback((entries: CatalogEntry[], source: 'auto' | 'manual' = 'manual') => runQueue(entries, source), [runQueue]);

  /**
   * Shared by `downloadChapter` (one chapter) and `downloadAllChapters`
   * (every chapter) - queues each given chapter as its own independent
   * download job, all sharing one `runDownload` call (a real shared
   * concurrency pool, not one uncapped fetch per chapter). Each chapter's
   * own pending-download record (see pendingDownloads.ts) is written
   * before its fetch starts and cleared once it settles - a page reload
   * mid-download kills that in-progress `fetch()` outright (there's no way
   * for a plain page-driven download to survive a navigation), so without
   * a persisted record there would be no trace it had ever been requested;
   * the resume-on-open effect below is what turns a leftover record from an
   * interrupted session back into a fresh retry.
   */
  const runChapterDownloads = useCallback(
    (entry: CatalogEntry, chapterIndices: number[]) => {
      const targets: DownloadTarget[] = [];
      for (const chapterIndex of chapterIndices) {
        const chapter = entry.audio[chapterIndex];
        if (!chapter) continue;
        targets.push({
          url: audioUrl(chapter.workerFilename),
          hebrewYear: entry.hebrewYear,
          occasionId: entry.occasionId,
          label: chapter.chapterName ?? `Track ${chapterIndex + 1}`,
          kind: 'audio',
          chapterIndex,
        });
      }
      if (targets.length === 0) return;

      setLiveState((prev) => {
        const next = { ...prev };
        for (const target of targets) next[chapterKey(target.hebrewYear, target.occasionId, target.chapterIndex!)] = 'queued';
        return next;
      });
      for (const target of targets) {
        addPendingChapterDownload({ hebrewYear: target.hebrewYear, occasionId: target.occasionId, chapterIndex: target.chapterIndex! });
      }

      void runDownload(targets, {
        wifiOnly: settings.wifiOnly,
        onEach: (target, event, fraction) => {
          const k = chapterKey(target.hebrewYear, target.occasionId, target.chapterIndex!);
          if (event === 'downloading') {
            setLiveState((prev) => (prev[k] === 'downloading' ? prev : { ...prev, [k]: 'downloading' }));
            if (fraction !== undefined) setProgress((prev) => ({ ...prev, [k]: fraction }));
            return;
          }
          setLiveState((prev) => ({ ...prev, [k]: event === 'error' ? 'none' : 'downloaded' }));
          setProgress((prev) => clearProgress(prev, k));
          // A chapter's own download icon is always a manual action -
          // releases any stale auto-download ledger entry the same way
          // runQueue's 'manual' path does, in case this exact file was
          // previously auto-fetched (see downloadLedger.ts).
          if (event === 'done') forgetAutoDownload(target.url);
          // Only cleared on confirmed success - an 'error' here is
          // indistinguishable from a page navigation aborting this same
          // fetch mid-flight: enough of the old page's JS still runs after
          // `location.reload()` for this very handler to fire, so clearing
          // the pending record on 'error' would erase the one thing the
          // resume-on-open effect below needs to retry it. The tradeoff -
          // a genuine failure also stays pending and gets retried next
          // open - is acceptable since these URLs come from the bundled
          // catalog and essentially never really 404.
          if (event !== 'error') {
            removePendingChapterDownload({ hebrewYear: target.hebrewYear, occasionId: target.occasionId, chapterIndex: target.chapterIndex! });
          }
        },
      });
    },
    [settings.wifiOnly],
  );

  const downloadChapter = useCallback((entry: CatalogEntry, chapterIndex: number) => runChapterDownloads(entry, [chapterIndex]), [runChapterDownloads]);
  const downloadAllChapters = useCallback(
    (entry: CatalogEntry) => runChapterDownloads(entry, entry.audio.map((_, index) => index)),
    [runChapterDownloads],
  );

  // Resume-on-open: anything left pending from an interrupted session (the
  // page reloaded or was closed mid-download) gets re-verified against the
  // real cache and, if genuinely still missing, re-queued automatically -
  // this is what makes a manual chapter download survive a reload (showing
  // the gray pending ring again) instead of silently reverting to a plain,
  // never-been-touched-looking download button. Runs once at mount, not on
  // every settings change - re-scanning on a later wifiOnly toggle, say,
  // would re-trigger an already-resumed download a second time.
  useEffect(() => {
    const pending = listPendingChapterDownloads();
    if (pending.length === 0) return;
    void (async () => {
      for (const p of pending) {
        const entry = (catalog[p.hebrewYear] ?? []).find((e) => e.occasionId === p.occasionId);
        const chapter = entry?.audio[p.chapterIndex];
        if (!entry || !chapter) {
          removePendingChapterDownload(p);
          continue;
        }
        const alreadyDownloaded = await isDownloaded({ url: audioUrl(chapter.workerFilename) });
        if (alreadyDownloaded) {
          removePendingChapterDownload(p);
          continue;
        }
        runChapterDownloads(entry, [p.chapterIndex]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once on mount; re-running this scan on a later settings change would re-trigger an already-resumed download.
  }, []);

  const value = useMemo(
    () => ({ settings, setSettings, downloadOccasion, enqueueBulk, downloadChapter, downloadAllChapters, liveState, progress }),
    [settings, setSettings, downloadOccasion, enqueueBulk, downloadChapter, downloadAllChapters, liveState, progress],
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}
