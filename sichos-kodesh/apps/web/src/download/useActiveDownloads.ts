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

  if (countedKeys.length === 0) return { count: 0, percent: 0 };
  const totalFraction = countedKeys.reduce((sum, k) => sum + (progress[k] ?? 0), 0);
  return { count: countedKeys.length, percent: Math.round((totalFraction / countedKeys.length) * 100) };
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
