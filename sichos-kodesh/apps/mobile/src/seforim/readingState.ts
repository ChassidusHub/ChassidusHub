import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyReadingState, parseReadingState, withBookmarkToggled, withPlace, withSettings, type ReaderSettings, type ReadingState } from '@sichos-kodesh/app-core';

export { isBookmarked, recentPlaces } from '@sichos-kodesh/app-core';

/**
 * What the reader remembers, on this phone only: its settings, where each
 * sefer was left (down to how far into the chapter), and the bookmarks.
 * The shape and every update live in app-core (the web keeps the same row
 * in its own storage); this is the phone's store: one AsyncStorage row,
 * read once at first use, every change written back and re-rendering
 * whoever reads it.
 */

const KEY = 'sichos-kodesh:seforim-reading';
const EMPTY: ReadingState = emptyReadingState();

let state: ReadingState = EMPTY;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: ReadingState): void {
  if (next === state) return;
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

export function setReaderSettings(change: Partial<ReaderSettings>): void {
  emit(withSettings(state, change));
}

/** Where a sefer was left: its unit, the edition read and how far into the unit (0 to 1). */
export function recordPlace(workId: string, unitId: string, source: number, offset?: number, now: Date = new Date()): void {
  emit(withPlace(state, workId, unitId, source, offset, now));
}

/** Adds the bookmark, or takes it away when it is there. */
export function toggleBookmark(workId: string, unitId: string, now: Date = new Date()): void {
  emit(withBookmarkToggled(state, workId, unitId, now));
}

/** For tests. */
export function resetReadingState(): void {
  state = EMPTY;
  loaded = null;
}
