import { useSyncExternalStore } from 'react';
import { emptyReadingState, parseReadingState, withBookmarkToggled, withPlace, withSettings, type ReaderSettings, type ReadingState } from '@sichos-kodesh/app-core';

export { isBookmarked, recentPlaces } from '@sichos-kodesh/app-core';

/**
 * What the reader remembers, in this browser only: its settings, where each
 * sefer was left (down to how far into the chapter), and the bookmarks.
 * The shape and every update live in app-core, the same as the phone's;
 * this is the web's store - one localStorage row (a few KB), read once,
 * every change written back and re-rendering whoever reads it.
 */

const KEY = 'sichos-kodesh:seforim-reading';

function read(): ReadingState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseReadingState(JSON.parse(raw)) : emptyReadingState();
  } catch {
    return emptyReadingState();
  }
}

let state: ReadingState | null = null;
const listeners = new Set<() => void>();

export function getReadingState(): ReadingState {
  state ??= read();
  return state;
}

function emit(next: ReadingState): void {
  if (next === getReadingState()) return;
  state = next;
  for (const listener of listeners) listener();
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota: the change still holds for this visit.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReadingState(): ReadingState {
  return useSyncExternalStore(subscribe, getReadingState, getReadingState);
}

export function setReaderSettings(change: Partial<ReaderSettings>): void {
  emit(withSettings(getReadingState(), change));
}

/** Where a sefer was left: its unit, the edition read and how far into the unit (0 to 1). */
export function recordPlace(workId: string, unitId: string, source: number, offset?: number, now: Date = new Date()): void {
  emit(withPlace(getReadingState(), workId, unitId, source, offset, now));
}

export function toggleBookmark(workId: string, unitId: string, now: Date = new Date()): void {
  emit(withBookmarkToggled(getReadingState(), workId, unitId, now));
}

/** For tests. */
export function resetReadingState(): void {
  state = null;
}
