import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATALOG_WORKS_SCHEMA_VERSION } from '@sichos-kodesh/catalog';
import { checkCatalogUpdate, fetchCatalogRelease, shouldCheckCatalog } from '@sichos-kodesh/app-core';
import type { CatalogCheckRecord } from '@sichos-kodesh/app-core';
import { getOnlineSnapshot } from '../network/connectivity';
import { APP_VERSION } from '../version';
import { catalogStore } from './catalogStore';
import { readStoredCatalog, writeStoredCatalog } from './catalogStorage';

const CHECK_RECORD_KEY = 'sichos-kodesh:catalog-check';

/** What Settings' "Update catalog" row shows. Same states as the web's catalogUpdater.ts. */
export type CatalogUpdateStatus = { phase: 'idle' } | { phase: 'checking' } | { phase: 'downloading'; version: string } | { phase: 'updated'; version: string } | { phase: 'up-to-date'; checkedAt: number } | { phase: 'error'; checkedAt: number };

let status: CatalogUpdateStatus = { phase: 'idle' };
let inFlight: Promise<CatalogUpdateStatus> | null = null;
const listeners = new Set<() => void>();

function setStatus(next: CatalogUpdateStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

async function readCheckRecord(): Promise<CatalogCheckRecord> {
  try {
    const raw = await AsyncStorage.getItem(CHECK_RECORD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CatalogCheckRecord>;
      return { checkedAt: typeof parsed.checkedAt === 'number' ? parsed.checkedAt : null, appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : null };
    }
  } catch {
    // Fall through to "never checked".
  }
  return { checkedAt: null, appVersion: null };
}

async function writeCheckRecord(): Promise<void> {
  try {
    await AsyncStorage.setItem(CHECK_RECORD_KEY, JSON.stringify({ checkedAt: Date.now(), appVersion: APP_VERSION } satisfies CatalogCheckRecord));
  } catch {
    // Best-effort only.
  }
}

/**
 * Swaps in the release stored by a previous launch, if any. Run once at
 * launch (useAutoCatalogUpdate below) and at the start of the headless
 * background task, so both see the newest data rather than the bundled
 * copy. Never throws.
 */
export async function loadStoredCatalog(): Promise<void> {
  const stored = await readStoredCatalog();
  if (stored) catalogStore.apply(stored, 'stored');
}

/**
 * Asks api.sk.chassidushub.org for a newer catalog and, if there is one, fetches
 * it, stores it and applies it live - every screen re-renders with the new
 * data in place, nothing is remounted. Concurrent calls share one run.
 * The final status is both returned and published through
 * `useCatalogUpdateStatus` for the Settings row.
 */
export function checkForCatalogUpdate(): Promise<CatalogUpdateStatus> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    setStatus({ phase: 'checking' });
    // Schema 3: the manifest under /v3/, whose catalog carries the library and the works too.
    const result = await checkCatalogUpdate({ currentVersion: catalogStore.get().version, schemaVersion: CATALOG_WORKS_SCHEMA_VERSION });
    if (result.status === 'error') {
      await writeCheckRecord();
      setStatus({ phase: 'error', checkedAt: Date.now() });
      return status;
    }
    if (result.status === 'up-to-date') {
      await writeCheckRecord();
      setStatus({ phase: 'up-to-date', checkedAt: Date.now() });
      return status;
    }
    setStatus({ phase: 'downloading', version: result.manifest.version });
    try {
      const release = await fetchCatalogRelease(result.manifest);
      await writeStoredCatalog(release);
      catalogStore.apply(release, 'fetched');
      await writeCheckRecord();
      setStatus({ phase: 'updated', version: release.version });
    } catch {
      await writeCheckRecord();
      setStatus({ phase: 'error', checkedAt: Date.now() });
    }
    return status;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** The silent check: once a day, and again right after the app itself updates. Used on launch and by the background task; never throws. */
export async function checkForCatalogUpdateIfDue(): Promise<void> {
  if (!getOnlineSnapshot()) return;
  if (!shouldCheckCatalog(await readCheckRecord(), APP_VERSION)) return;
  await checkForCatalogUpdate().catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getStatus(): CatalogUpdateStatus {
  return status;
}

export function useCatalogUpdateStatus(): CatalogUpdateStatus {
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}

/**
 * Mounted once at the app root. The first screen renders with the bundled
 * catalog straight away (no blank frame waiting on a file read); the
 * release a previous launch stored is swapped in a moment later, then the
 * silent check runs (see checkForCatalogUpdateIfDue). "Update catalog" in
 * Settings is the same check, run on demand.
 */
export function useAutoCatalogUpdate(): void {
  useEffect(() => {
    loadStoredCatalog()
      .then(() => checkForCatalogUpdateIfDue())
      .catch(() => undefined);
  }, []);
}
