import { useEffect, useRef, useState } from 'react';
import { audioChapterName, occasionTitle } from '@chassidushub-reader/app-core';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { useDownload } from './useDownload';
import type { RowDownloadState } from './downloadContext';
import { getCatalog } from '../catalog/catalogStore';
import { useLanguage } from '../i18n/useLanguage';
import type { Language } from '../i18n/translations';

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
}

function isChapterKey(k: string): boolean {
  return k.startsWith('chapter:');
}

/** `chapter:{hebrewYear}:{occasionId}:{chapterIndex}` -> `{hebrewYear}:{occasionId}` - the plain occasion key this chapter key mirrors, if it's part of an occasion-level job (see DownloadProvider's runQueue). */
function occasionKeyOfChapterKey(k: string): string {
  const [, hebrewYear, occasionId] = k.split(':');
  return `${hebrewYear}:${occasionId}`;
}

/**
 * The counted keys for both hooks below - a chapter key is skipped when its
 * own occasion-level key is also active, since that chapter key is just
 * runQueue's own mirror of a file already counted by the occasion job, not
 * a second job (double-counting a bulk/week download as its chapter count
 * *plus* one more for the occasion itself, a real risk given `liveState`'s
 * two overlapping key shapes - see downloadContext.ts).
 */
function countedActiveKeys(liveState: Record<string, RowDownloadState>): string[] {
  const activeKeys = Object.entries(liveState)
    .filter(([, state]) => state === 'queued' || state === 'downloading')
    .map(([k]) => k);
  const activeOccasionKeys = new Set(activeKeys.filter((k) => !isChapterKey(k)));
  return activeKeys.filter((k) => !isChapterKey(k) || !activeOccasionKeys.has(occasionKeyOfChapterKey(k)));
}

/** One entry per real in-flight file transfer, aggregated for the global download-progress bar. */
export function useActiveDownloads(): ActiveDownloadsSummary {
  const { liveState, progress } = useDownload();
  const countedKeys = countedActiveKeys(liveState);
  const count = countedKeys.length;

  // Average the per-key progress fractions (0-1) already maintained by
  // DownloadProvider. For chapter keys each fraction is the raw byte ratio;
  // for occasion keys it is (completedFiles + activeByteSum) / totalFilesForOccasion,
  // so it already accounts for multiple concurrent files without double-counting.
  const rawFraction = count > 0 ? countedKeys.reduce((sum, k) => sum + (progress[k] ?? 0), 0) / count : 0;
  const realPercent = Math.round(rawFraction * 100);

  // hasRealProgress is true once actual byte-level fractions start arriving.
  // When false (e.g. no Content-Length header, or still in the initial
  // 'queued' state), we fall back to the simulated floor below.
  const hasRealProgress = realPercent > 0;

  // prevPercentRef enforces "never go backward" across renders. Reset to 0
  // only when count reaches 0 (all downloads finished), handled in useEffect.
  const prevPercentRef = useRef(0);

  // Simulated floor: only active when there is no real byte progress (no
  // Content-Length or still queued). Slowly advances toward ~85% so the bar
  // feels lively while waiting for the first real progress event. Paused
  // automatically once real progress arrives - the real fraction takes over.
  // 500 ms ticks with an 8% step toward 85: after ~5 s ≈ 48%, after ~10 s ≈ 70%.
  const [simulatedFloor, setSimulatedFloor] = useState(0);
  useEffect(() => {
    if (count === 0) {
      setSimulatedFloor(0);
      prevPercentRef.current = 0;
      return;
    }
    if (hasRealProgress) return; // real data is coming in - no simulation needed
    const id = setInterval(() => {
      setSimulatedFloor((prev) => Math.min(prev + (85 - prev) * 0.08, 84));
    }, 500);
    return () => clearInterval(id);
  }, [count, hasRealProgress]);

  if (count === 0) return { count: 0, percent: 0 };

  // If real progress is available, use it directly (plus the never-go-backward
  // floor). Only mix in simulatedFloor when nothing real is moving yet.
  const base = hasRealProgress ? Math.max(realPercent, prevPercentRef.current) : Math.max(simulatedFloor, prevPercentRef.current);
  // Cap at 99 while downloads are still active - the bar hides at count=0, so
  // 100% is never actually shown while it's visible.
  const percent = Math.min(Math.round(base), 99);
  prevPercentRef.current = percent;
  return { count, percent };
}

/** `key` -> the catalog entry + label for it (in the UI language), or `null` for a key whose occasion/chapter can no longer be resolved. */
function entryInfoForKey(key: string, language: Language): { entry: CatalogEntry; label: string } | null {
  const parts = key.split(':');
  const [hebrewYear, occasionId] = (isChapterKey(key) ? parts.slice(1) : parts).map(Number);
  const entry = (getCatalog()[hebrewYear] ?? []).find((e) => e.occasionId === occasionId);
  if (!entry) return null;
  const title = occasionTitle(entry, language);
  if (!isChapterKey(key)) return { entry, label: title };
  const chapterIndex = Number(parts[3]);
  const chapter = entry.audio[chapterIndex];
  const chapterName = chapter && audioChapterName(chapter, language);
  return { entry, label: chapterName ? `${title} - ${chapterName}` : title };
}

/** Per-item detail for DownloadedScreen's "in progress" section - the full list the global progress bar's own aggregate summarizes. */
export function useActiveDownloadRows(): ActiveDownloadRow[] {
  const { liveState, progress } = useDownload();
  const { language } = useLanguage();
  const countedKeys = countedActiveKeys(liveState);

  const rows: ActiveDownloadRow[] = [];
  for (const key of countedKeys) {
    const info = entryInfoForKey(key, language);
    if (info) {
      rows.push({
        key,
        label: info.label,
        hebrewYear: info.entry.hebrewYear,
        occasionId: info.entry.occasionId,
        percent: Math.round((progress[key] ?? 0) * 100),
      });
    }
  }
  return rows;
}
