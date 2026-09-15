import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { isEntryFullyDownloaded, listDownloadTargets, runDownload } from './downloadManager';
import { DownloadContext } from './downloadContext';
import type { RowDownloadState } from './downloadContext';
import { useDownloadSettings } from '../settings/useDownloadSettings';

function key(hebrewYear: number, occasionId: number): string {
  return `${hebrewYear}:${occasionId}`;
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

  const runQueue = useCallback(
    (entries: CatalogEntry[]) => {
      const targets = listDownloadTargets(entries, settings.contentTypes);
      if (targets.length === 0) return;

      const entryByKey = new Map(entries.map((entry) => [key(entry.hebrewYear, entry.occasionId), entry]));
      const remaining = new Map<string, number>();
      for (const target of targets) {
        const k = key(target.hebrewYear, target.occasionId);
        remaining.set(k, (remaining.get(k) ?? 0) + 1);
      }
      setLiveState((prev) => {
        const next = { ...prev };
        for (const k of remaining.keys()) next[k] = 'queued';
        return next;
      });

      void runDownload(targets, {
        wifiOnly: settings.wifiOnly,
        onEach: (target, event) => {
          const k = key(target.hebrewYear, target.occasionId);
          if (event === 'downloading') {
            setLiveState((prev) => (prev[k] === 'downloading' ? prev : { ...prev, [k]: 'downloading' }));
            return;
          }
          const left = (remaining.get(k) ?? 1) - 1;
          remaining.set(k, left);
          if (left > 0) return; // Other files for this same occasion are still pending.
          const entry = entryByKey.get(k);
          if (!entry) return;
          // Re-checked against the real cache rather than trusting the
          // event stream alone - one target erroring shouldn't be masked
          // by the rest succeeding, and this is the same definition of
          // "downloaded" the lazy per-row check (useDownloadState) uses.
          void isEntryFullyDownloaded(entry, settings.contentTypes).then((downloaded) => {
            setLiveState((prev) => ({ ...prev, [k]: downloaded ? 'downloaded' : 'none' }));
          });
        },
      });
    },
    [settings.contentTypes, settings.wifiOnly],
  );

  const downloadOccasion = useCallback((entry: CatalogEntry) => runQueue([entry]), [runQueue]);
  const enqueueBulk = useCallback((entries: CatalogEntry[]) => runQueue(entries), [runQueue]);

  const value = useMemo(
    () => ({ settings, setSettings, downloadOccasion, enqueueBulk, liveState }),
    [settings, setSettings, downloadOccasion, enqueueBulk, liveState],
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}
