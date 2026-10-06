import { parseReaderSettings, type ReaderSettings } from './readerSettings.js';

/**
 * What the reader remembers, on each device: the reader's settings, where
 * each sefer was left, and the bookmarks. Each app keeps one row of it in its
 * own storage (AsyncStorage on the phone, localStorage on the web) and reads
 * it through `parseReadingState`; the updates below are pure.
 */

export interface ReadingPlace {
  unitId: string;
  source: number;
  /** ISO time of the last visit. */
  at: string;
  /** How far into the unit the reader was, from 0 (its top) to 1 (its end). */
  offset?: number;
}

export interface Bookmark {
  workId: string;
  unitId: string;
  at: string;
}

export interface ReadingState {
  settings: ReaderSettings;
  places: Record<string, ReadingPlace>;
  bookmarks: Bookmark[];
}

function isPlace(value: unknown): value is ReadingPlace {
  const v = value as ReadingPlace;
  return !!v && typeof v.unitId === 'string' && typeof v.source === 'number' && typeof v.at === 'string' && (v.offset === undefined || (typeof v.offset === 'number' && v.offset >= 0 && v.offset <= 1));
}

function isBookmark(value: unknown): value is Bookmark {
  const v = value as Bookmark;
  return !!v && typeof v.workId === 'string' && typeof v.unitId === 'string' && typeof v.at === 'string';
}

export function emptyReadingState(): ReadingState {
  return { settings: parseReaderSettings(undefined), places: {}, bookmarks: [] };
}

/** A stored row, checked field by field: anything unreadable falls back to the default. Reads the text size older versions stored as `fontScale`. */
export function parseReadingState(raw: unknown): ReadingState {
  if (!raw || typeof raw !== 'object') return emptyReadingState();
  const value = raw as Partial<ReadingState> & { fontScale?: unknown };
  const places: Record<string, ReadingPlace> = {};
  if (value.places && typeof value.places === 'object') for (const [workId, place] of Object.entries(value.places)) if (isPlace(place)) places[workId] = place;
  const bookmarks = Array.isArray(value.bookmarks) ? value.bookmarks.filter(isBookmark) : [];
  return { settings: parseReaderSettings(value.settings, value.fontScale), places, bookmarks };
}

export function withSettings(state: ReadingState, change: Partial<ReaderSettings>): ReadingState {
  return { ...state, settings: parseReaderSettings({ ...state.settings, ...change }) };
}

/** The same state back when nothing changed, so a store can skip the write. */
export function withPlace(state: ReadingState, workId: string, unitId: string, source: number, offset: number | undefined, now: Date = new Date()): ReadingState {
  const current = state.places[workId];
  const rounded = offset === undefined ? undefined : Math.round(Math.min(1, Math.max(0, offset)) * 1000) / 1000;
  if (current && current.unitId === unitId && current.source === source && current.offset === rounded) return state;
  const place: ReadingPlace = { unitId, source, at: now.toISOString() };
  if (rounded !== undefined) place.offset = rounded;
  return { ...state, places: { ...state.places, [workId]: place } };
}

export function isBookmarked(state: ReadingState, workId: string, unitId: string): boolean {
  return state.bookmarks.some((b) => b.workId === workId && b.unitId === unitId);
}

/** Adds the bookmark, or takes it away when it is there. Newest first. */
export function withBookmarkToggled(state: ReadingState, workId: string, unitId: string, now: Date = new Date()): ReadingState {
  const without = state.bookmarks.filter((b) => !(b.workId === workId && b.unitId === unitId));
  const bookmarks = without.length < state.bookmarks.length ? without : [{ workId, unitId, at: now.toISOString() }, ...without];
  return { ...state, bookmarks };
}

/** The seforim last read, most recent first. */
export function recentPlaces(state: ReadingState, limit = 3): Array<{ workId: string; place: ReadingPlace }> {
  return Object.entries(state.places)
    .map(([workId, place]) => ({ workId, place }))
    .sort((a, b) => b.place.at.localeCompare(a.place.at))
    .slice(0, limit);
}
