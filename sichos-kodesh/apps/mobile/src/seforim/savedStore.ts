import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The seforim saved on this phone straight from their source (Sefaria),
 * for reading with no internet and searching word by word - the way a
 * farbrengen downloads straight from its source, with no pack in between.
 *
 * - Each saved text is the same text object the reader renders online,
 *   at `texts/saved/<work>/<unit>@<edition>.html` (the unit id's slashes
 *   written as `~`).
 * - Each fully saved sefer has a search index the phone built, in the
 *   packs' own layout, at `indexes/saved_<work>.sqlite`.
 * - One AsyncStorage row says which seforim are saved, how much, and
 *   whether the saving finished; the files themselves are the truth for
 *   each unit.
 *
 * A text pack's copy, when the phone has one, still comes first: its
 * bytes are vouched for by the catalog's sha256.
 */

export interface SavedSefer {
  /** Texts saved, and their bytes. */
  units: number;
  bytes: number;
  /** True once every text that may be read was saved and the index built. */
  complete: boolean;
  /** The search index, relative to the files directory, once built. */
  index: string | null;
  /** The catalog version the texts were saved under. */
  catalog: string;
  /** ISO time of the last change. */
  at: string;
}

export interface SavedState {
  seforim: Record<string, SavedSefer>;
}

const KEY = 'sichos-kodesh:seforim-saved';
const EMPTY: SavedState = { seforim: {} };

let state: SavedState = EMPTY;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function savedDir(workId: string): string {
  return `texts/saved/${workId}`;
}

export function savedTextPath(workId: string, unitId: string, source: number): string {
  return `${savedDir(workId)}/${unitId.replace(/\//g, '~')}@${source}.html`;
}

export function savedIndexPath(workId: string): string {
  return `indexes/saved_${workId}.sqlite`;
}

function isSaved(value: unknown): value is SavedSefer {
  const v = value as SavedSefer;
  return !!v && typeof v.units === 'number' && typeof v.bytes === 'number' && typeof v.complete === 'boolean' && (v.index === null || typeof v.index === 'string') && typeof v.catalog === 'string' && typeof v.at === 'string';
}

/** A stored row, checked entry by entry: anything unreadable is dropped. */
export function parseSavedState(raw: unknown): SavedState {
  const seforim: Record<string, SavedSefer> = {};
  const value = raw as Partial<SavedState> | null;
  if (value && typeof value.seforim === 'object' && value.seforim) for (const [workId, saved] of Object.entries(value.seforim)) if (isSaved(saved)) seforim[workId] = saved;
  return { seforim };
}

function emit(next: SavedState): void {
  state = next;
  for (const listener of listeners) listener();
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

/** Reads the stored row once; safe to call from anywhere. */
export function loadSavedState(): Promise<void> {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      // A change made before the row was read wins over the row.
      if (state === EMPTY && raw) {
        state = parseSavedState(JSON.parse(raw));
        for (const listener of listeners) listener();
      }
    })
    .catch(() => undefined);
  return loaded;
}

export async function getSavedState(): Promise<SavedState> {
  await loadSavedState();
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  loadSavedState().catch(() => undefined);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;

export function useSavedSeforim(): SavedState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function recordSaved(workId: string, saved: Omit<SavedSefer, 'at'>, now: Date = new Date()): void {
  emit({ seforim: { ...state.seforim, [workId]: { ...saved, at: now.toISOString() } } });
}

export function forgetSaved(workId: string): void {
  if (!state.seforim[workId]) return;
  const seforim = { ...state.seforim };
  delete seforim[workId];
  emit({ seforim });
}

/** The saved seforim's search indexes: work id -> the index file. */
export async function savedSearchIndexes(): Promise<Map<string, string>> {
  const { seforim } = await getSavedState();
  const indexes = new Map<string, string>();
  for (const [workId, saved] of Object.entries(seforim)) if (saved.index) indexes.set(workId, saved.index);
  return indexes;
}

/** For tests. */
export function resetSavedState(): void {
  state = EMPTY;
  loaded = null;
}
