import { useEffect, useMemo, useRef, useState } from 'react';
import { occasionTitle } from '@chassidushub-reader/app-core';
import type { LibraryCollectionId } from '@chassidushub-reader/catalog';
import { useCatalog } from '../catalog/catalogStore';
import { useLanguage } from '../i18n/useTranslation';
import { parseLibraryTargetKey } from '../library/libraryDownloads';
import { useDownload } from './useDownload';
import { useDownloadsCanRun } from './useDownloadsCanRun';

export interface ActiveDownloadsSummary {
  count: number;
  /** 0-100, the average completion fraction across every counted job. */
  percent: number;
}

export interface ActiveDownloadRow {
  key: string;
  label: string;
  hebrewYear: number;
  occasionId: number;
  /** 0-100 */
  percent: number;
  /** Set for a library item's files (src/library): its row opens the item, not a farbrengen. */
  library?: { collection: LibraryCollectionId; id: string };
}

/**
 * One entry per real in-flight file transfer, aggregated for the global
 * download-progress bar - with the web's own "never go backward, simulate a
 * slow climb until real bytes arrive" smoothing. While downloads can't run
 * (no connection, or no Wi-Fi for Wi-Fi-only downloads - useDownloadsCanRun)
 * nothing is in flight: the queue waits, and neither the bar nor a climbing
 * percentage says otherwise.
 */
export function useActiveDownloads(): ActiveDownloadsSummary {
  const { targetStates } = useDownload();
  const canRun = useDownloadsCanRun();
  const active = canRun ? Object.values(targetStates).filter((state) => state.status === 'queued' || state.status === 'downloading') : [];
  const count = active.length;
  const rawFraction = count > 0 ? active.reduce((sum, state) => sum + (state.status === 'downloading' ? state.progress : 0), 0) / count : 0;
  const realPercent = Math.round(rawFraction * 100);
  const hasRealProgress = realPercent > 0;
  const prevPercentRef = useRef(0);
  const [simulatedFloor, setSimulatedFloor] = useState(0);

  useEffect(() => {
    if (count === 0) {
      setSimulatedFloor(0);
      prevPercentRef.current = 0;
      return;
    }
    if (hasRealProgress) return;
    const id = setInterval(() => {
      setSimulatedFloor((prev) => Math.min(prev + (85 - prev) * 0.08, 84));
    }, 500);
    return () => clearInterval(id);
  }, [count, hasRealProgress]);

  if (count === 0) return { count: 0, percent: 0 };

  const base = hasRealProgress ? Math.max(realPercent, prevPercentRef.current) : Math.max(simulatedFloor, prevPercentRef.current);
  const percent = Math.min(Math.round(base), 99);
  prevPercentRef.current = percent;
  return { count, percent };
}

/** Per-occasion detail for DownloadedScreen's "in progress" section - the full list the global progress bar's own aggregate summarizes (none while downloads can't run, as there). */
export function useActiveDownloadRows(): ActiveDownloadRow[] {
  const catalog = useCatalog();
  const { targetStates } = useDownload();
  const { language } = useLanguage();
  const canRun = useDownloadsCanRun();

  return useMemo(() => {
    if (!canRun) return [];
    const groups = new Map<string, { row: ActiveDownloadRow; sum: number; files: number }>();
    for (const state of Object.values(targetStates)) {
      if (state.status !== 'queued' && state.status !== 'downloading') continue;
      const groupKey = `${state.target.hebrewYear}:${state.target.occasionId}`;
      const fraction = state.status === 'downloading' ? state.progress : 0;
      const current = groups.get(groupKey);
      if (current) {
        current.sum += fraction;
        current.files += 1;
        continue;
      }
      const entry = catalog[state.target.hebrewYear]?.find((item) => item.occasionId === state.target.occasionId);
      const library = parseLibraryTargetKey(state.target.key);
      groups.set(groupKey, {
        row: {
          key: groupKey,
          hebrewYear: state.target.hebrewYear,
          occasionId: state.target.occasionId,
          label: entry ? occasionTitle(entry, language) : state.target.label,
          percent: 0,
          ...(library ? { library: { collection: library.collection, id: library.itemId } } : {}),
        },
        sum: fraction,
        files: 1,
      });
    }
    return [...groups.values()]
      .map(({ row, sum, files }) => ({ ...row, percent: Math.round((sum / files) * 100) }))
      .sort((a, b) => a.hebrewYear - b.hebrewYear || a.occasionId - b.occasionId);
  }, [canRun, catalog, language, targetStates]);
}
