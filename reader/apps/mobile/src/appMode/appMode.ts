import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * How the phone uses the app, chosen at first start and changed in
 * Settings:
 *
 * - `online`: it downloads - connection notices, download buttons and
 *   progress, the automatic download, as the app always did.
 * - `offline`: everything comes from an imported pack. None of that shows
 *   and nothing downloads, even in the background; until a pack is on the
 *   phone, the home screen asks for one.
 *
 * Importing a pack works in both (Settings > Offline packs).
 */
export type AppMode = 'online' | 'offline';

const STORAGE_KEY = 'app-mode';

/** undefined until storage is read; null when no mode has been chosen yet (the first start). */
let mode: AppMode | null | undefined;
const listeners = new Set<() => void>();

function set(next: AppMode | null): void {
  if (mode === next) return;
  mode = next;
  for (const listener of listeners) listener();
}

function parse(raw: string | null): AppMode | null {
  return raw === 'online' || raw === 'offline' ? raw : null;
}

/** The stored mode, for code with no component tree (the background task). */
export async function readStoredAppMode(): Promise<AppMode | null> {
  try {
    return parse(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Reads the stored mode once, at start-up. */
export async function loadAppMode(): Promise<void> {
  if (mode !== undefined) return;
  set(await readStoredAppMode());
}

export function setAppMode(next: AppMode): void {
  set(next);
  AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
}

export function getAppMode(): AppMode | null | undefined {
  return mode;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The mode, live: undefined while loading, null before the first choice. */
export function useAppMode(): AppMode | null | undefined {
  return useSyncExternalStore(subscribe, getAppMode);
}

/** Whether downloads, their buttons and the connection notices are part of the app: every mode but offline pack mode. */
export function useOnlineMode(): boolean {
  return useAppMode() !== 'offline';
}
