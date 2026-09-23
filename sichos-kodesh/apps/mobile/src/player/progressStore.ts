import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CatalogEntry } from '@sichos-kodesh/catalog';

const STORAGE_KEY = 'sichos-kodesh:progress';
const LAST_PLAYLIST_KEY = 'sichos-kodesh:last-playlist';

/** How much of a chapter counts as "listened" for finished-marking purposes - matches the common convention (YouTube, podcast apps) of not requiring the literal last second, since a recording's tail is often trailing silence/room noise. */
const FINISHED_FRACTION = 0.9;

interface ChapterProgress {
  /** Furthest position reached, in seconds - never regresses on a replay from earlier in the same chapter, so scrubbing back doesn't erase "finished" status. */
  position: number;
  duration: number;
}

export interface PdfProgress {
  driveFileId: string;
  /** The page the reader was last on (1-based) - react-native-pdf's own page model, the mobile counterpart of the web's scroll fraction. */
  page: number;
  totalPages: number | null;
}

/** Which of an occasion's two kinds of content (a chapter's recording, or a PDF's reading position) was most recently active - what the home page's Continue section resumes into. */
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

/** What was in the player when the app was last used - restored (paused) into the player bar on the next launch, the same way the web player survives a reload. */
export interface LastPlaylistSnapshot {
  hebrewYear: number;
  occasionId: number;
  chapterIndex: number;
  position: number;
}

function key(hebrewYear: number, occasionId: number): string {
  return `${hebrewYear}:${occasionId}`;
}

/**
 * The store lives in memory (a plain object replaced immutably on every
 * write, so `useSyncExternalStore` sees a new snapshot) and is mirrored to
 * AsyncStorage with a short debounce. `hydrateProgressStore` runs once at
 * app start - anything recorded before it resolves is merged over the
 * stored copy, never lost.
 */
let store: ProgressStore = {};
let lastPlaylist: LastPlaylistSnapshot | null = null;
let hydrationPromise: Promise<void> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function notifyProgressChanged(): void {
  for (const listener of listeners) listener();
}

/** Lets `useProgressMap` (and anything else holding a snapshot of the store) know a write happened, so a screen that stays mounted while playback continues keeps reflecting progress instead of freezing at whatever existed when it mounted. */
export function subscribeToProgressChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function sanitizeStore(value: unknown): ProgressStore {
  if (!isRecord(value)) return {};
  const next: ProgressStore = {};
  for (const [k, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const hebrewYear = Number(raw.hebrewYear);
    const occasionId = Number(raw.occasionId);
    if (!Number.isFinite(hebrewYear) || !Number.isFinite(occasionId)) continue;
    const chapters: Record<number, ChapterProgress> = {};
    if (isRecord(raw.chapters)) {
      for (const [index, chapter] of Object.entries(raw.chapters)) {
        if (!isRecord(chapter)) continue;
        const position = Number(chapter.position);
        const duration = Number(chapter.duration);
        if (Number.isFinite(position) && Number.isFinite(duration)) chapters[Number(index)] = { position, duration };
      }
    }
    const progress: OccasionProgress = {
      hebrewYear,
      occasionId,
      occasionLabel: typeof raw.occasionLabel === 'string' ? raw.occasionLabel : '',
      lastVisitedAt: Number.isFinite(Number(raw.lastVisitedAt)) ? Number(raw.lastVisitedAt) : 0,
      chapters,
    };
    if (isRecord(raw.lastActivity)) {
      if (raw.lastActivity.kind === 'pdf') progress.lastActivity = { kind: 'pdf' };
      else if (raw.lastActivity.kind === 'audio' && Number.isFinite(Number(raw.lastActivity.chapterIndex))) {
        progress.lastActivity = { kind: 'audio', chapterIndex: Number(raw.lastActivity.chapterIndex) };
      }
    }
    if (isRecord(raw.pdf) && typeof raw.pdf.driveFileId === 'string') {
      const page = Number(raw.pdf.page);
      const totalPages = Number(raw.pdf.totalPages);
      progress.pdf = {
        driveFileId: raw.pdf.driveFileId,
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
        totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : null,
      };
    }
    next[k] = progress;
  }
  return next;
}

function sanitizeLastPlaylist(value: unknown): LastPlaylistSnapshot | null {
  if (!isRecord(value)) return null;
  const hebrewYear = Number(value.hebrewYear);
  const occasionId = Number(value.occasionId);
  const chapterIndex = Number(value.chapterIndex);
  const position = Number(value.position);
  if (![hebrewYear, occasionId, chapterIndex, position].every(Number.isFinite)) return null;
  return { hebrewYear, occasionId, chapterIndex: Math.max(0, Math.floor(chapterIndex)), position: Math.max(0, position) };
}

/** Reads the persisted store once; safe to call more than once (later calls await the same load). Entries written before this resolves win over their stored counterparts. */
export function hydrateProgressStore(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(LAST_PLAYLIST_KEY)])
      .then(([rawStore, rawPlaylist]) => {
        const stored = rawStore ? sanitizeStore(JSON.parse(rawStore)) : {};
        store = { ...stored, ...store };
        if (!lastPlaylist && rawPlaylist) lastPlaylist = sanitizeLastPlaylist(JSON.parse(rawPlaylist));
        notifyProgressChanged();
      })
      .catch(() => {
        // Best-effort persistence only - an unreadable store just starts empty.
      });
  }
  return hydrationPromise;
}

function schedulePersist(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store)).catch(() => {
      // Best-effort persistence only.
    });
  }, 1000);
}

/** Writes any debounced changes out immediately - for the moment the app is backgrounded, when a pending timer may never fire. */
export function flushProgressStore(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store)).catch(() => undefined);
}

function writeStore(next: ProgressStore): void {
  store = next;
  schedulePersist();
  notifyProgressChanged();
}

/** The whole store, keyed for `getOccasionProgress` - read once per screen (via useProgressMap) and passed down, so a long occasion list doesn't hit storage per row. */
export function readProgressMap(): ProgressStore {
  return store;
}

export function getOccasionProgress(map: ProgressStore, hebrewYear: number, occasionId: number): OccasionProgress | undefined {
  return map[key(hebrewYear, occasionId)];
}

/** Records that the user opened this occasion's own page - drives the home page's "Continue" section's recency ordering, independent of whether anything was actually played. */
export function recordVisit(hebrewYear: number, occasionId: number, occasionLabel: string): void {
  const k = key(hebrewYear, occasionId);
  const existing = store[k];
  writeStore({ ...store, [k]: { ...existing, hebrewYear, occasionId, occasionLabel, lastVisitedAt: Date.now(), chapters: existing?.chapters ?? {} } });
}

/** Records listening progress on one chapter - called from PlayerProvider's throttled position tracking, not on every tick. */
export function recordChapterProgress(hebrewYear: number, occasionId: number, occasionLabel: string, chapterIndex: number, position: number, duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const k = key(hebrewYear, occasionId);
  const existing = store[k];
  const priorPosition = existing?.chapters[chapterIndex]?.position ?? 0;
  writeStore({
    ...store,
    [k]: {
      ...existing,
      hebrewYear,
      occasionId,
      occasionLabel,
      lastVisitedAt: existing?.lastVisitedAt ?? Date.now(),
      chapters: { ...existing?.chapters, [chapterIndex]: { position: Math.max(priorPosition, position), duration } },
      lastActivity: { kind: 'audio', chapterIndex },
    },
  });
}

/** Records the page reached in one PDF - only the most recently read PDF is kept per occasion (see `OccasionProgress.pdf`), since that's the only one a single Continue tap can resume into. */
export function recordPdfProgress(hebrewYear: number, occasionId: number, occasionLabel: string, driveFileId: string, page: number, totalPages: number | null): void {
  const k = key(hebrewYear, occasionId);
  const existing = store[k];
  writeStore({
    ...store,
    [k]: {
      ...existing,
      hebrewYear,
      occasionId,
      occasionLabel,
      lastVisitedAt: existing?.lastVisitedAt ?? Date.now(),
      chapters: existing?.chapters ?? {},
      lastActivity: { kind: 'pdf' },
      pdf: { driveFileId, page: Math.max(1, Math.floor(page)), totalPages: totalPages && totalPages > 0 ? Math.floor(totalPages) : null },
    },
  });
}

/** The saved page for one specific PDF, or undefined when nothing was saved for it (a different PDF from the same occasion was last read instead, or it's never been opened). */
export function getPdfPage(progress: OccasionProgress | undefined, driveFileId: string): number | undefined {
  return progress?.pdf?.driveFileId === driveFileId ? progress.pdf.page : undefined;
}

/** Every visited/played occasion, most recently visited first. */
export function listRecentOccasions(limit: number): OccasionProgress[] {
  return Object.values(store)
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, limit);
}

/** Overall listened fraction across every chapter of `entry`, weighted by each chapter's real duration. 0 when nothing of this occasion has ever been played. */
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

/** Which chapter (and saved position within it) a "play this occasion's recording" action should start from: the last-played chapter if it isn't finished yet, otherwise the first unfinished chapter, otherwise chapter 0 from the very start. */
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

export function getLastPlaylist(): LastPlaylistSnapshot | null {
  return lastPlaylist;
}

export function recordLastPlaylist(next: LastPlaylistSnapshot | null): void {
  lastPlaylist = next;
  (next ? AsyncStorage.setItem(LAST_PLAYLIST_KEY, JSON.stringify(next)) : AsyncStorage.removeItem(LAST_PLAYLIST_KEY)).catch(() => {
    // Best-effort persistence only.
  });
}
