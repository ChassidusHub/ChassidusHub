import { useEffect, useSyncExternalStore } from 'react';
import { CATALOG_WORKS_SCHEMA_VERSION } from '@chassidushub-reader/catalog';
import { checkCatalogUpdate, fetchCatalogRelease, shouldCheckCatalog } from '@chassidushub-reader/app-core';
import type { CatalogCheckRecord } from '@chassidushub-reader/app-core';
import { APP_VERSION } from '../changelog';
import { catalogStore } from './catalogStore';
import { readStoredCatalog, writeStoredCatalog } from './catalogStorage';

const CHECK_RECORD_KEY = 'chassidushub:catalog-check';

/** What the About screen shows about the last check. */
export type CatalogUpdateStatus = { phase: 'idle' } | { phase: 'checking' } | { phase: 'downloading'; version: string } | { phase: 'updated'; version: string } | { phase: 'up-to-date'; checkedAt: number } | { phase: 'error'; checkedAt: number };

let status: CatalogUpdateStatus = { phase: 'idle' };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setStatus(next: CatalogUpdateStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

function readCheckRecord(): CatalogCheckRecord {
  try {
    const raw = localStorage.getItem(CHECK_RECORD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CatalogCheckRecord>;
      return { checkedAt: typeof parsed.checkedAt === 'number' ? parsed.checkedAt : null, appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : null };
    }
  } catch {
    // Fall through to "never checked".
  }
  return { checkedAt: null, appVersion: null };
}

function writeCheckRecord(): void {
  try {
    localStorage.setItem(CHECK_RECORD_KEY, JSON.stringify({ checkedAt: Date.now(), appVersion: APP_VERSION } satisfies CatalogCheckRecord));
  } catch {
    // Best-effort only.
  }
}

/**
 * Called once before React mounts (main.tsx): swaps in the release stored
 * by a previous visit, if any, so the first paint already shows the newest
 * data rather than flashing the bundled copy and re-rendering a moment
 * later. Never throws.
 */
export async function loadStoredCatalog(): Promise<void> {
  const stored = await readStoredCatalog();
  if (stored) catalogStore.apply(stored, 'stored');
}

/**
 * Asks api.chassidushub.org/v1/app for a newer catalog and, if there is one, fetches
 * it, stores it and applies it live - every screen re-renders with the new
 * data in place. Concurrent calls share one run. The result is reported
 * through `useCatalogUpdateStatus` rather than returned, since the caller
 * that matters (the automatic check on load) has nowhere to put it.
 */
export function checkForCatalogUpdate(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    setStatus({ phase: 'checking' });
    const result = await checkCatalogUpdate({ currentVersion: catalogStore.get().version, schemaVersion: CATALOG_WORKS_SCHEMA_VERSION });
    if (result.status === 'error') {
      writeCheckRecord();
      setStatus({ phase: 'error', checkedAt: Date.now() });
      return;
    }
    if (result.status === 'up-to-date') {
      writeCheckRecord();
      setStatus({ phase: 'up-to-date', checkedAt: Date.now() });
      return;
    }
    setStatus({ phase: 'downloading', version: result.manifest.version });
    try {
      const release = await fetchCatalogRelease(result.manifest);
      await writeStoredCatalog(release);
      catalogStore.apply(release, 'fetched');
      writeCheckRecord();
      setStatus({ phase: 'updated', version: release.version });
    } catch {
      writeCheckRecord();
      setStatus({ phase: 'error', checkedAt: Date.now() });
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
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
 * The web app has no "update catalog" button: it checks on its own, once
 * a day and again right after the app itself updates (a new APP_VERSION
 * always triggers a fresh check - see shouldCheckCatalog), so a newer
 * catalog arrives with no one asking. Mounted once at the app root.
 */
export function useAutoCatalogUpdate(): void {
  useEffect(() => {
    if (!navigator.onLine) return;
    if (!shouldCheckCatalog(readCheckRecord(), APP_VERSION)) return;
    void checkForCatalogUpdate();
  }, []);
}
