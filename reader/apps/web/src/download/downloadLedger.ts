const STORAGE_KEY = 'chassidushub:auto-download-ledger';

export interface LedgerEntry {
  hebrewYear: number;
  occasionId: number;
  /** When this URL was last (re-)claimed by the auto-download sync - see recordAutoDownload's own comment for why this refreshes on every sync run, not just the first. */
  cachedAt: number;
}

type Ledger = Record<string, LedgerEntry>;

function readLedger(): Ledger {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Ledger) : {};
  } catch {
    return {};
  }
}

function writeLedger(ledger: Ledger): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    // Best-effort persistence only.
  }
}

/**
 * Tracks which cached files exist *because the auto-download sync fetched
 * them*, separately from Cache Storage itself (which has no concept of
 * "why" an entry is there) - this is the whole reason pruneAutoDownloads.ts
 * can safely delete old auto-fetched content without ever touching
 * anything a manual download or ordinary browsing happened to cache too.
 * Only auto-download ever calls this - a manual download/tap instead calls
 * `forgetAutoDownload` on the same URL (see DownloadProvider.tsx), which
 * is what keeps a file the user has since engaged with directly out of
 * the auto-managed set for good, not just until the next sync run.
 *
 * Called again, refreshing `cachedAt`, every time the auto-sync re-claims
 * a URL it already fetched before (still relevant to the current
 * week/month) - not just on the file's very first download. This makes
 * retention mean "N weeks since this was last relevant to auto-download,"
 * not "N weeks since it happened to be fetched once," so content that
 * stays continuously targeted never goes stale-eligible just because of
 * when it first arrived.
 */
export function recordAutoDownload(url: string, hebrewYear: number, occasionId: number): void {
  const ledger = readLedger();
  ledger[url] = { hebrewYear, occasionId, cachedAt: Date.now() };
  writeLedger(ledger);
}

/** Removes `url` from the auto-managed set - called whenever a manual download/re-download touches a URL the auto-sync previously claimed, so pruneAutoDownloads.ts never deletes something the user has since directly engaged with. A no-op if `url` was never auto-tracked. */
export function forgetAutoDownload(url: string): void {
  const ledger = readLedger();
  if (!(url in ledger)) return;
  delete ledger[url];
  writeLedger(ledger);
}

export function listAutoDownloads(): Array<LedgerEntry & { url: string }> {
  const ledger = readLedger();
  return Object.entries(ledger).map(([url, entry]) => ({ url, ...entry }));
}

/** Wipes every tracked entry outright - called alongside "Clear downloads" (DownloadSettingsScreen), which empties the whole cache these entries describe, so nothing stale is left pointing at cache entries that no longer exist. */
export function clearAutoDownloadLedger(): void {
  writeLedger({});
}
