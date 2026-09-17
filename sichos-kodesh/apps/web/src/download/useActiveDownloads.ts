import { useEffect, useRef, useState } from 'react';
import { useDownload } from './useDownload';
import type { RowDownloadState } from './downloadContext';
import catalog from '../catalog/data';

export interface ActiveDownloadsSummary {
  count: number;
  /** 0-100, the average completion fraction across every counted job. */
  percent: number;
}

export interface ActiveDownloadRow {
  key: string;
  label: string;
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

  // prevPercentRef enforces "never go backward" - once the bar has shown N%
  // it won't drop back even if new queued keys (at 0%) momentarily lower the
  // average. Reset to 0 only when count reaches 0 (all downloads finished).
  const prevPercentRef = useRef(0);

  // Simulated floor: slowly advances toward ~85% even when real byte-level
  // progress isn't available (e.g. a response with no Content-Length). This
  // makes the bar feel lively instead of frozen at 0 the whole time.
  // Resets whenever count flips back to 0 so a fresh batch always starts
  // from 0. 500 ms ticks with an 8% step toward 85 means: after ~5 s ≈ 48%,
  // after ~10 s ≈ 70%, after ~15 s ≈ 80% - a reasonable proxy for a
  // slow-ish audio download without Content-Length.
  const [simulatedFloor, setSimulatedFloor] = useState(0);
  useEffect(() => {
    if (count === 0) {
      setSimulatedFloor(0);
      return;
    }
    const id = setInterval(() => {
      setSimulatedFloor((prev) => Math.min(prev + (85 - prev) * 0.08, 84));
    }, 500);
    return () => clearInterval(id);
  }, [count]);

  if (count === 0) {
    prevPercentRef.current = 0;
    return { count: 0, percent: 0 };
  }

  // Average the per-key progress fractions (0-1) already maintained by
  // DownloadProvider. For chapter keys each fraction is the raw byte ratio;
  // for occasion keys it is (completedFiles + activeByteSum) / totalFilesForOccasion,
  // so it already accounts for multiple concurrent files without double-counting.
  // This means a single in-progress download advances the bar in real time
  // rather than staying at 0% until the file finishes.
  const rawFraction = countedKeys.reduce((sum, k) => sum + (progress[k] ?? 0), 0) / count;
  const realPercent = Math.round(rawFraction * 100);

  // Cap at 99 while downloads are still active - the bar hides at count=0, so
  // 100% is never actually shown while it's visible.
  const percent = Math.min(Math.max(realPercent, simulatedFloor, prevPercentRef.current), 99);
  prevPercentRef.current = percent;
  return { count, percent };
}

/** `key` -> a human label for it via the catalog, or `null` for a key whose occasion/chapter can no longer be resolved (a stale key from a removed catalog entry - skipped rather than shown as a dead row). */
function labelForKey(key: string): string | null {
  const parts = key.split(':');
  const [hebrewYear, occasionId] = (isChapterKey(key) ? parts.slice(1) : parts).map(Number);
  const entry = (catalog[hebrewYear] ?? []).find((e) => e.occasionId === occasionId);
  if (!entry) return null;
  if (!isChapterKey(key)) return entry.occasionLabel;
  const chapterIndex = Number(parts[3]);
  const chapter = entry.audio[chapterIndex];
  return chapter?.chapterName ? `${entry.occasionLabel} - ${chapter.chapterName}` : entry.occasionLabel;
}

/** Per-item detail for DownloadedScreen's "in progress" section - the full list the global progress bar's own aggregate summarizes. */
export function useActiveDownloadRows(): ActiveDownloadRow[] {
  const { liveState, progress } = useDownload();
  const countedKeys = countedActiveKeys(liveState);

  const rows: ActiveDownloadRow[] = [];
  for (const key of countedKeys) {
    const label = labelForKey(key);
    if (label) rows.push({ key, label, percent: Math.round((progress[key] ?? 0) * 100) });
  }
  return rows;
}
