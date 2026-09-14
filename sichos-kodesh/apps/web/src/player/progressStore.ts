import type { CatalogEntry } from '@sichos-kodesh/catalog';

const STORAGE_KEY = 'sichos-kodesh:progress';

/** How much of a chapter counts as "listened" for finished-marking purposes - matches the common convention (YouTube, podcast apps) of not requiring the literal last second, since a recording's tail is often trailing silence/room noise. */
const FINISHED_FRACTION = 0.9;

interface ChapterProgress {
  /** Furthest position reached, in seconds - never regresses on a replay from earlier in the same chapter, so scrubbing back doesn't erase "finished" status. */
  position: number;
  duration: number;
}

export interface OccasionProgress {
  hebrewYear: number;
  occasionId: number;
  occasionLabel: string;
  lastVisitedAt: number;
  chapters: Record<number, ChapterProgress>;
}

export type ProgressStore = Record<string, OccasionProgress>;

function key(hebrewYear: number, occasionId: number): string {
  return `${hebrewYear}:${occasionId}`;
}

/** The whole store, keyed for `getOccasionProgress` - read once per screen (not once per row) and passed down, so a long occasion list doesn't hit localStorage per row. */
export function readProgressMap(): ProgressStore {
  return readStore();
}

export function getOccasionProgress(map: ProgressStore, hebrewYear: number, occasionId: number): OccasionProgress | undefined {
  return map[key(hebrewYear, occasionId)];
}

function readStore(): ProgressStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: ProgressStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Best-effort persistence only.
  }
}

/** Records that the user opened this occasion's own page - drives the home page's "Continue" section's recency ordering, independent of whether anything was actually played. */
export function recordVisit(hebrewYear: number, occasionId: number, occasionLabel: string): void {
  const store = readStore();
  const k = key(hebrewYear, occasionId);
  const existing = store[k];
  store[k] = { hebrewYear, occasionId, occasionLabel, lastVisitedAt: Date.now(), chapters: existing?.chapters ?? {} };
  writeStore(store);
}

/** Records listening progress on one chapter - called from PlayerProvider's throttled `onTimeUpdate`, not on every tick. */
export function recordChapterProgress(
  hebrewYear: number,
  occasionId: number,
  occasionLabel: string,
  chapterIndex: number,
  position: number,
  duration: number,
): void {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const store = readStore();
  const k = key(hebrewYear, occasionId);
  const existing = store[k];
  const priorPosition = existing?.chapters[chapterIndex]?.position ?? 0;
  store[k] = {
    hebrewYear,
    occasionId,
    occasionLabel,
    lastVisitedAt: existing?.lastVisitedAt ?? Date.now(),
    chapters: { ...existing?.chapters, [chapterIndex]: { position: Math.max(priorPosition, position), duration } },
  };
  writeStore(store);
}

/** Every visited/played occasion, most recently visited first. */
export function listRecentOccasions(limit: number): OccasionProgress[] {
  return Object.values(readStore())
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, limit);
}

/**
 * Overall listened fraction across every chapter of `entry` (not just the
 * ones with recorded progress - a chapter never played counts as 0
 * toward the total), weighted by each chapter's real duration so a short
 * niggun finishing doesn't count as much as a long sicha. 0 when nothing
 * of this occasion has ever been played.
 */
export function occasionProgressFraction(progress: OccasionProgress | undefined, entry: CatalogEntry): number {
  if (!progress || entry.audio.length === 0) return 0;
  let played = 0;
  let total = 0;
  entry.audio.forEach((chapter, index) => {
    const chapterDuration = chapter.durationMs / 1000;
    total += chapterDuration;
    const recorded = progress.chapters[index];
    if (recorded) played += Math.min(recorded.position, chapterDuration);
  });
  return total > 0 ? played / total : 0;
}

export function isOccasionFinished(progress: OccasionProgress | undefined, entry: CatalogEntry): boolean {
  if (!progress || entry.audio.length === 0) return false;
  return entry.audio.every((chapter, index) => {
    const recorded = progress.chapters[index];
    if (!recorded) return false;
    const chapterDuration = chapter.durationMs / 1000;
    return chapterDuration > 0 && recorded.position / chapterDuration >= FINISHED_FRACTION;
  });
}
