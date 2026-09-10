import type { DatabaseSync } from 'node:sqlite';
import { allKnownIds, upsertRecord } from './db.js';
import type { RevalidationResult } from './httpClient.js';
import { parseFragmentPage } from './parseFragment.js';
import { parseListingPage } from './parseListing.js';
import { PRE_NESIUS_BUCKET_PATH, REAL_STANDALONE_YEARS } from './crawl.js';

const BASE_URL = 'https://www.mafteiach.app';

/** The one method syncAll needs - satisfied by `PoliteFetcher`, and trivially fakeable in tests without a live site. */
export interface RevalidatingFetcher {
  fetchWithRevalidation(url: string): Promise<RevalidationResult>;
}

export interface SyncOptions {
  db: DatabaseSync;
  fetcher: RevalidatingFetcher;
  onProgress?: (info: { phase: 'listings' | 'occasions'; index: number; total: number }) => void;
}

export interface SyncResult {
  checked: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** In the live listing but not previously in the DB (a subset of `inserted`, reported separately for visibility). */
  newIds: number[];
  /** In the DB but no longer present in the live listing - not auto-deleted, just surfaced for a human to look at. */
  missingIds: number[];
}

/**
 * Incremental refresh: re-checks every listing page (cheap - ~44 requests,
 * always revalidated since listings don't carry a stable per-entry
 * signal otherwise) to find ids the site has added or removed, then
 * revalidates every currently-listed occasion's detail fragment via
 * conditional GET (`If-None-Match`) - a full site check is still ~3,400
 * requests, but almost all of them come back as a cheap 304 when nothing
 * changed, and only genuinely new/edited occasions get re-parsed and
 * written to the DB. This is what "safe to run repeatedly, e.g. weekly or
 * monthly" actually means for a rate-limited crawler against a small
 * community site - not skipping the check, but making an unchanged check
 * nearly free for the site to serve.
 */
export async function syncAll(options: SyncOptions): Promise<SyncResult> {
  const fetcher = options.fetcher;

  const listingPaths = [PRE_NESIUS_BUCKET_PATH];
  for (let year = REAL_STANDALONE_YEARS.from; year <= REAL_STANDALONE_YEARS.to; year++) {
    listingPaths.push(`/all/by_year/${year}`);
  }

  const liveEntries = new Map<number, ReturnType<typeof parseListingPage>[number]>();
  for (let i = 0; i < listingPaths.length; i++) {
    const { body } = await fetcher.fetchWithRevalidation(`${BASE_URL}${listingPaths[i]}.js?include_right_nav=false`);
    for (const entry of parseListingPage(body)) liveEntries.set(entry.id, entry);
    options.onProgress?.({ phase: 'listings', index: i + 1, total: listingPaths.length });
  }

  const knownIdsBefore = new Set(allKnownIds(options.db));
  const liveIds = [...liveEntries.keys()];
  const newIds = liveIds.filter((id) => !knownIdsBefore.has(id));
  const missingIds = [...knownIdsBefore].filter((id) => !liveEntries.has(id));

  const result: SyncResult = { checked: 0, inserted: 0, updated: 0, unchanged: 0, newIds, missingIds };
  const now = new Date().toISOString();

  for (let i = 0; i < liveIds.length; i++) {
    const id = liveIds[i]!;
    const entry = liveEntries.get(id)!;
    const { body, etag } = await fetcher.fetchWithRevalidation(`${BASE_URL}/all/${id}/fragment.js`);
    const detail = parseFragmentPage(body, id);
    const { status } = upsertRecord(options.db, { ...entry, detail }, etag, now);
    result.checked++;
    result[status === 'inserted' ? 'inserted' : status === 'updated' ? 'updated' : 'unchanged']++;
    options.onProgress?.({ phase: 'occasions', index: i + 1, total: liveIds.length });
  }

  return result;
}
