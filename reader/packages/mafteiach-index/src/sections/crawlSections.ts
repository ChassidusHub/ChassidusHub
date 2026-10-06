import type { DatabaseSync } from 'node:sqlite';
import { crawlAllGrouping } from './allGroupings.js';
import { newResult, SECTION_IDS } from './context.js';
import type { SectionContext, SectionId, SectionProgress, SectionResult } from './context.js';
import type { SectionFetcher } from './document.js';
import { crawlHadranim } from './hadranim.js';
import { crawlLikkuteiSichos } from './likkuteiSichos.js';
import { crawlMaamorim } from './maamorim.js';
import { crawlMichtavim } from './michtavim.js';
import { crawlYomanim } from './yomanim.js';

export interface CrawlSectionsOptions {
  db: DatabaseSync;
  fetcher: SectionFetcher;
  /** Default: all of them, in `SECTION_IDS` order. */
  sections?: readonly SectionId[];
  /** Caps each loop of pages per section - a pilot run. New/missing ids are not reported on a limited run. */
  limit?: number;
  /** false: re-parse every page fetched before from the cache, without a request. Default true (conditional GETs). */
  revalidate?: boolean;
  onProgress?: (progress: SectionProgress) => void;
  now?: string;
}

const CRAWLERS: Record<SectionId, (ctx: SectionContext) => Promise<void>> = {
  likkuteiSichos: crawlLikkuteiSichos,
  maamorim: crawlMaamorim,
  yomanim: crawlYomanim,
  hadranim: crawlHadranim,
  michtavim: crawlMichtavim,
  moadim: (ctx) => crawlAllGrouping(ctx, 'moadim'),
  parshiyos: (ctx) => crawlAllGrouping(ctx, 'parshiyos'),
};

/**
 * Crawls (the first time) or syncs (every later time) the sections of
 * mafteiach beyond the dated farbrengens - one command for both: a URL
 * never fetched is a plain GET, a URL fetched before is a conditional GET
 * that costs the site a 304 when nothing changed, and every page goes
 * through the same parse-and-upsert, so only real changes are written.
 * Run the farbrengen `sync` first: moadim and parshiyos group its
 * occasions, and maamorim are tied to them.
 */
export async function crawlSections(options: CrawlSectionsOptions): Promise<SectionResult[]> {
  const sections = options.sections ?? SECTION_IDS;
  const now = options.now ?? new Date().toISOString();
  const memo = new Map<string, string>();
  const results: SectionResult[] = [];
  for (const section of sections) {
    const ctx: SectionContext = {
      db: options.db,
      fetcher: options.fetcher,
      now,
      limit: options.limit,
      revalidate: options.revalidate ?? true,
      result: newResult(section),
      onProgress: options.onProgress,
      memo,
    };
    await CRAWLERS[section](ctx);
    results.push(ctx.result);
  }
  return results;
}

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}
