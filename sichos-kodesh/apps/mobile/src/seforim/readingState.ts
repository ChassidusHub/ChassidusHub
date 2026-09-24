import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What the reader remembers, on this phone only:
 * - the text size;
 * - where each sefer was left (its unit, and the edition read);
 * - the bookmarks.
 * One AsyncStorage row, read once at first use; every change is written
 * back and re-renders whoever reads it.
 */

export interface ReadingPlace {
  unitId: string;
  source: number;
  /** ISO time of the last visit. */
  at: string;
}

export interface Bookmark {
  workId: string;
  unitId: string;
  at: string;
}

export interface ReadingState {
  /** Multiplies the reader's base text size: 0.8 to 1.8, in steps of 0.1. */
  fontScale: number;
  places: Record<string, ReadingPlace>;
  bookmarks: Bookmark[];
}

const KEY = 'sichos-kodesh:seforim-reading';
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.8;
const EMPTY: ReadingState = { fontScale: 1, places: {}, bookmarks: [] };

let state: ReadingState = EMPTY;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function isPlace(value: unknown): value is ReadingPlace {
  const v = value as ReadingPlace;
  return !!v && typeof v.unitId === 'string' && typeof v.source === 'number' && typeof v.at === 'string';
}

function isBookmark(value: unknown): value is Bookmark {
  const v = value as Bookmark;
  return !!v && typeof v.workId === 'string' && typeof v.unitId === 'string' && typeof v.at === 'string';
}

/** A stored row, checked field by field: anything unreadable falls back to the default. */
export function parseReadingState(raw: unknown): ReadingState {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const value = raw as Partial<ReadingState>;
  const fontScale = typeof value.fontScale === 'number' && value.fontScale >= FONT_SCALE_MIN && value.fontScale <= FONT_SCALE_MAX ? value.fontScale : 1;
  const places: Record<string, ReadingPlace> = {};
  if (value.places && typeof value.places === 'object') for (const [workId, place] of Object.entries(value.places)) if (isPlace(place)) places[workId] = place;
  const bookmarks = Array.isArray(value.bookmarks) ? value.bookmarks.filter(isBookmark) : [];
  return { fontScale, places, bookmarks };
}

function emit(next: ReadingState): void {
  state = next;
  for (const listener of listeners) listener();
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

/** Reads the stored row once; safe to call from every screen. */
export function loadReadingState(): Promise<void> {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      // A change made before the row was read wins over the row.
      if (state === EMPTY && raw) {
        state = parseReadingState(JSON.parse(raw));
        for (const listener of listeners) listener();
      }
    })
    .catch(() => undefined);
  return loaded;
}

export function getReadingState(): ReadingState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  loadReadingState().catch(() => undefined);
  return () => {
    listeners.delete(listener);
  };
}

export function useReadingState(): ReadingState {
  return useSyncExternalStore(subscribe, getReadingState, getReadingState);
}

export function setFontScale(scale: number): void {
  const rounded = Math.round(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale)) * 10) / 10;
  if (rounded !== state.fontScale) emit({ ...state, fontScale: rounded });
}

export function recordPlace(workId: string, unitId: string, source: number, now: Date = new Date()): void {
  const current = state.places[workId];
  if (current && current.unitId === unitId && current.source === source) return;
  emit({ ...state, places: { ...state.places, [workId]: { unitId, source, at: now.toISOString() } } });
}

export function isBookmarked(reading: ReadingState, workId: string, unitId: string): boolean {
  return reading.bookmarks.some((b) => b.workId === workId && b.unitId === unitId);
}

/** Adds the bookmark, or takes it away when it is there. Newest first. */
export function toggleBookmark(workId: string, unitId: string, now: Date = new Date()): void {
  const without = state.bookmarks.filter((b) => !(b.workId === workId && b.unitId === unitId));
  const bookmarks = without.length < state.bookmarks.length ? without : [{ workId, unitId, at: now.toISOString() }, ...without];
  emit({ ...state, bookmarks });
}

/** The seforim last read, most recent first. */
export function recentPlaces(reading: ReadingState, limit = 3): Array<{ workId: string; place: ReadingPlace }> {
  return Object.entries(reading.places)
    .map(([workId, place]) => ({ workId, place }))
    .sort((a, b) => b.place.at.localeCompare(a.place.at))
    .slice(0, limit);
}

/** For tests. */
export function resetReadingState(): void {
  state = EMPTY;
  loaded = null;
}
