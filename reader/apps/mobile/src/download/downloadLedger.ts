import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chassidushub:auto-download-ledger';

export interface LedgerEntry {
  hebrewYear: number;
  occasionId: number;
  /** When this target was last (re-)claimed by the auto-download sync - refreshed on every sync run, not just the first (see the web's downloadLedger.ts). */
  cachedAt: number;
}

type Ledger = Record<string, LedgerEntry>;

let ledger: Ledger = {};
let hydrationPromise: Promise<void> | null = null;

function persist(): void {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ledger)).catch(() => {
    // Best-effort persistence only.
  });
}

/** Loads the persisted ledger once; entries recorded before it resolves win over their stored counterparts. */
export function hydrateAutoDownloadLedger(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return;
        ledger = { ...(parsed as Ledger), ...ledger };
      })
      .catch(() => undefined);
  }
  return hydrationPromise;
}

/**
 * Tracks which downloaded files exist *because the auto-download sync
 * fetched them*, keyed by download-target key - the whole reason
 * pruneAutoDownloads.ts can safely delete old auto-fetched content without
 * ever touching anything a manual download happened to fetch too. Only
 * auto-download ever calls this; a manual download instead calls
 * `forgetAutoDownload` on the same key.
 */
export function recordAutoDownload(targetKey: string, hebrewYear: number, occasionId: number): void {
  ledger = { ...ledger, [targetKey]: { hebrewYear, occasionId, cachedAt: Date.now() } };
  persist();
}

/** Removes `targetKey` from the auto-managed set - a no-op if it was never auto-tracked. */
export function forgetAutoDownload(targetKey: string): void {
  if (!(targetKey in ledger)) return;
  const next = { ...ledger };
  delete next[targetKey];
  ledger = next;
  persist();
}

export function listAutoDownloads(): Array<LedgerEntry & { targetKey: string }> {
  return Object.entries(ledger).map(([targetKey, entry]) => ({ targetKey, ...entry }));
}

/** Wipes every tracked entry outright - called alongside "Clear downloads", which deletes the files these entries describe. */
export function clearAutoDownloadLedger(): void {
  ledger = {};
  persist();
}
