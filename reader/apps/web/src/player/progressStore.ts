import type { CatalogEntry } from '@chassidushub-reader/catalog';

const STORAGE_KEY = 'chassidushub:progress';

/** How much of a chapter counts as "listened" for finished-marking purposes - matches the common convention (YouTube, podcast apps) of not requiring the literal last second, since a recording's tail is often trailing silence/room noise. */
const FINISHED_FRACTION = 0.9;

interface ChapterProgress {
  /** Furthest position reached, in seconds - never regresses on a replay from earlier in the same chapter, so scrubbing back doesn't erase "finished" status. */
  position: number;
  duration: number;
}

export interface PdfProgress {
  driveFileId: string;
  /** Scroll position as a fraction (0-1) of the document's total scrollable height - resolution-independent, so it still lands in roughly the right place if the viewport size changes between visits. */
  scrollFraction: number;
}

/** Which of an occasion's two kinds of content (a chapter's recording, or a PDF's reading position) was most recently active - what the home page's Continue section resumes into, since only one of them can be "continued" by a single tap. */
export type OccasionActivity = { kind: 'audio'; chapterIndex: number } | { kind: 'pdf' };

export interface OccasionProgress {
  hebrewYear: number;
  occasionId: number;
  occasionLabel: string;
  lastVisitedAt: number;
  chapters: Record<number, ChapterProgress>;
  lastActivity?: OccasionActivity;
  /** Only ever the most recently read PDF for this occasion - see `lastActivity`. */
  pdf?: PdfProgress;
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
  notifyProgressChanged();
}

/**
 * Lets `useProgressMap` (and anything else holding a snapshot of the
 * store) know a write happened, so it can re-read and re-render - without
 * this, a screen that stays mounted while playback continues (the
 * recordings/playlist page, most visibly) would keep showing whatever
 * progress existed the moment it first mounted, never advancing, even
 * though PlayerProvider's own throttled writes are landing in localStorage
 * the whole time. A plain in-memory listener set, not a storage event
 * (which only fires for *other* tabs/documents, never the one that made
 * the write).
 */
const progressChangeListeners = new Set<() => void>();

export function subscribeToProgressChanges(listener: () => void): () => void {
  progressChangeListeners.add(listener);
  return () => progressChangeListeners.delete(listener);
}

function notifyProgressChanged(): void {
  for (const listener of progressChangeListeners) listener();
}

/** Records that the user opened this occasion's own page - drives the home page's "Continue" section's recency ordering, independent of whether anything was actually played. */
export function recordVisit(hebrewYear: number, occasionId: number, occasionLabel: string): void {
  const store = readStore();
  const k = key(hebrewYear, occasionId);
  const existing = store[k];
  store[k] = { ...existing, hebrewYear, occasionId, occasionLabel, lastVisitedAt: Date.now(), chapters: existing?.chapters ?? {} };
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
    ...existing,
    hebrewYear,
    occasionId,
    occasionLabel,
    lastVisitedAt: existing?.lastVisitedAt ?? Date.now(),
    chapters: { ...existing?.chapters, [chapterIndex]: { position: Math.max(priorPosition, position), duration } },
    lastActivity: { kind: 'audio', chapterIndex },
  };
  writeStore(store);
}

/** Records the scroll position reached in one PDF - called from PdfViewerScreen's throttled scroll handler, same rationale as `recordChapterProgress`. Only the most recently read PDF is kept per occasion (see `OccasionProgress.pdf`), since that's the only one a single Continue tap can resume into. */
export function recordPdfProgress(
  hebrewYear: number,
  occasionId: number,
  occasionLabel: string,
  driveFileId: string,
  scrollFraction: number,
): void {
  const store = readStore();
  const k = key(hebrewYear, occasionId);
  const existing = store[k];
  store[k] = {
    ...existing,
    hebrewYear,
    occasionId,
    occasionLabel,
    lastVisitedAt: existing?.lastVisitedAt ?? Date.now(),
    chapters: existing?.chapters ?? {},
    lastActivity: { kind: 'pdf' },
    pdf: { driveFileId, scrollFraction },
  };
  writeStore(store);
}

/** The saved scroll position for one specific PDF, or undefined when nothing was saved for it (a different PDF from the same occasion was last read instead, or it's never been opened). */
export function getPdfScrollFraction(progress: OccasionProgress | undefined, driveFileId: string): number | undefined {
  return progress?.pdf?.driveFileId === driveFileId ? progress.pdf.scrollFraction : undefined;
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

/** Same threshold as `isOccasionFinished`, for one chapter - drives RecordingsScreen's per-row finished marker. */
export function isChapterFinished(progress: OccasionProgress | undefined, chapterIndex: number, chapter: { durationMs: number }): boolean {
  const recorded = progress?.chapters[chapterIndex];
  if (!recorded) return false;
  const chapterDuration = chapter.durationMs / 1000;
  return chapterDuration > 0 && recorded.position / chapterDuration >= FINISHED_FRACTION;
}

/** How far into one chapter the listener has gotten, 0-1 - drives RecordingsScreen's per-row in-progress fill for a chapter that isn't finished yet. */
export function chapterProgressFraction(progress: OccasionProgress | undefined, chapterIndex: number, chapter: { durationMs: number }): number {
  const recorded = progress?.chapters[chapterIndex];
  if (!recorded) return 0;
  const chapterDuration = chapter.durationMs / 1000;
  return chapterDuration > 0 ? Math.min(recorded.position / chapterDuration, 1) : 0;
}

/**
 * Which chapter (and saved position within it) a "play this occasion's
 * recording" action - the Spotify-style play button on FarbrengenScreen
 * and RecordingsScreen - should start from: the last-played chapter if
 * it isn't finished yet (same chapter `lastActivity` already tracks for
 * the home page's Continue section), otherwise the first unfinished
 * chapter, otherwise chapter 0 from the very start (every chapter already
 * finished - the same "start over" a finished playlist gets elsewhere).
 */
export function resumeAudioChapter(progress: OccasionProgress | undefined, entry: CatalogEntry): { chapterIndex: number; position: number } {
  if (progress?.lastActivity?.kind === 'audio') {
    const { chapterIndex } = progress.lastActivity;
    const chapter = entry.audio[chapterIndex];
    if (chapter && !isChapterFinished(progress, chapterIndex, chapter)) {
      return { chapterIndex, position: progress.chapters[chapterIndex]?.position ?? 0 };
    }
  }
  const firstUnfinished = entry.audio.findIndex((chapter, index) => !isChapterFinished(progress, index, chapter));
  if (firstUnfinished !== -1) {
    return { chapterIndex: firstUnfinished, position: progress?.chapters[firstUnfinished]?.position ?? 0 };
  }
  return { chapterIndex: 0, position: 0 };
}
