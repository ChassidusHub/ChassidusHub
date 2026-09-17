import { useRef } from 'react';
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

  // Session-level tracking so the bar never goes backwards and the percent is
  // relative to the full set of queued items, not just the ones still active.
  // Refs are used because these are auxiliary display values - we don't need an
  // extra render for them; the re-render triggered by liveState/progress changes
  // is already sufficient.
  const sessionTotalRef = useRef(0);
  const sessionFloorRef = useRef(0);

  if (countedKeys.length === 0) {
    sessionTotalRef.current = 0;
    sessionFloorRef.current = 0;
    return { count: 0, percent: 0 };
  }

  // Expand the session total when new items are added; never shrink it as items
  // complete - that would reset the denominator and make the bar jump backward.
  if (countedKeys.length > sessionTotalRef.current) {
    sessionTotalRef.current = countedKeys.length;
  }

  // Items that completed and dropped out of the active-key set count as 1.0
  // each - "completed" = session total minus still-active remainder.
  const completedCount = sessionTotalRef.current - countedKeys.length;
  const inProgressFraction = countedKeys.reduce((sum, k) => sum + (progress[k] ?? 0), 0);

  // Global progress = (completed + in-progress fractions) / session total.
  // Never decreases thanks to sessionFloorRef.
  const rawPercent = Math.round(((completedCount + inProgressFraction) / sessionTotalRef.current) * 100);
  const percent = Math.max(rawPercent, sessionFloorRef.current);
  sessionFloorRef.current = percent;

  return { count: countedKeys.length, percent };
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
