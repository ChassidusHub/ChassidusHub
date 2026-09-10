import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PoliteFetcher } from './httpClient.js';
import { parseFragmentPage } from './parseFragment.js';
import { parseListingPage } from './parseListing.js';
import type { FarbrengenListingEntry, FarbrengenRecord } from './types.js';

const BASE_URL = 'https://www.mafteiach.app';

/**
 * The site's real per-year coverage, confirmed against its own sidebar nav
 * (not by brute-forcing year numbers: individual `/all/by_year/{year}`
 * requests for years outside real coverage silently fall back to
 * rendering 5711's content instead of 404ing, which will otherwise produce
 * confidently-wrong "data"). Pre-Nesius content (5690-5710) lives only in
 * one combined bucket page rather than per-year pages; 5710 also has its
 * own standalone page whose entries overlap the bucket's tail, so a global
 * id-based dedup (not a per-year one) is required across the whole crawl.
 */
export const REAL_STANDALONE_YEARS = { from: 5710, to: 5752 } as const;
export const PRE_NESIUS_BUCKET_PATH = '/all/by_year/5690_5710';

export interface CrawlProgress {
  scope: string;
  index: number;
  total: number;
  id: number;
}

export interface CrawlOptions {
  outDir: string;
  cacheDir: string;
  userAgent: string;
  delayMs?: number;
  onProgress?: (progress: CrawlProgress) => void;
}

async function fetchListing(fetcher: PoliteFetcher, urlPath: string): Promise<FarbrengenListingEntry[]> {
  const raw = await fetcher.fetchText(`${BASE_URL}${urlPath}.js?include_right_nav=false`);
  return parseListingPage(raw);
}

async function fetchDetail(fetcher: PoliteFetcher, id: number) {
  const raw = await fetcher.fetchText(`${BASE_URL}/all/${id}/fragment.js`);
  return parseFragmentPage(raw, id);
}

/**
 * Crawls the site's entire real coverage (the pre-Nesius bucket plus every
 * standalone year) and writes one JSON file per Hebrew year to `outDir`,
 * deduplicated by farbrengen id. Safe to interrupt and re-run — the
 * fetcher's on-disk cache makes every step resumable, and re-running after
 * a full prior run does no network I/O at all.
 */
export async function crawlAll(options: CrawlOptions): Promise<Map<number, FarbrengenRecord[]>> {
  const fetcher = new PoliteFetcher({
    cacheDir: options.cacheDir,
    userAgent: options.userAgent,
    delayMs: options.delayMs,
  });
  await mkdir(options.outDir, { recursive: true });

  const listings: FarbrengenListingEntry[] = [];
  listings.push(...(await fetchListing(fetcher, PRE_NESIUS_BUCKET_PATH)));
  for (let year = REAL_STANDALONE_YEARS.from; year <= REAL_STANDALONE_YEARS.to; year++) {
    listings.push(...(await fetchListing(fetcher, `/all/by_year/${year}`)));
  }

  const byId = new Map<number, FarbrengenListingEntry>();
  for (const entry of listings) byId.set(entry.id, entry); // dedup: the bucket's tail overlaps standalone 5710
  const uniqueEntries = [...byId.values()];

  const byYear = new Map<number, FarbrengenRecord[]>();
  for (let i = 0; i < uniqueEntries.length; i++) {
    const entry = uniqueEntries[i]!;
    const detail = await fetchDetail(fetcher, entry.id);
    const record: FarbrengenRecord = { ...entry, detail };
    const yearRecords = byYear.get(entry.hebrewYear) ?? [];
    yearRecords.push(record);
    byYear.set(entry.hebrewYear, yearRecords);
    options.onProgress?.({ scope: 'all', index: i + 1, total: uniqueEntries.length, id: entry.id });
  }

  for (const [year, records] of byYear) {
    records.sort((a, b) => a.hebrewDate.localeCompare(b.hebrewDate) || a.id - b.id);
    await writeFile(path.join(options.outDir, `${year}.json`), JSON.stringify(records, null, 2), 'utf8');
  }

  return byYear;
}

/** Crawls a single already-known-valid standalone year (for quick pilots/tests) without touching the pre-Nesius bucket. */
export async function crawlYear(
  year: number,
  fetcher: PoliteFetcher,
  onProgress?: CrawlOptions['onProgress'],
): Promise<FarbrengenRecord[]> {
  const listing = await fetchListing(fetcher, `/all/by_year/${year}`);
  const records: FarbrengenRecord[] = [];
  for (let i = 0; i < listing.length; i++) {
    const entry = listing[i]!;
    const detail = await fetchDetail(fetcher, entry.id);
    records.push({ ...entry, detail });
    onProgress?.({ scope: String(year), index: i + 1, total: listing.length, id: entry.id });
  }
  return records;
}
