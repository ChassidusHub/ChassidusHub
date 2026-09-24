import type { DatabaseSync } from 'node:sqlite';
import type { SectionFetcher } from './document.js';
import { hashValue, replaceRows, syncStatus } from './tracked.js';
import type { ChangeStatus } from './tracked.js';
import type { MembershipPage, NavEntry } from './types.js';

export const SECTION_IDS = ['likkuteiSichos', 'maamorim', 'yomanim', 'hadranim', 'michtavim', 'moadim', 'parshiyos'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface SectionResult {
  section: SectionId;
  /** Pages read this run (from the network or, with `revalidate: false`, from the cache). */
  pages: number;
  /** Of those, pages whose body was new or different from the cached copy. */
  changedPages: number;
  checked: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Items listed for the first time. */
  newIds: string[];
  /** Items the database has that the site no longer lists - reported, never deleted. Empty on a `limit` run, which does not see everything. */
  missingIds: string[];
  warnings: string[];
}

export interface SectionProgress {
  section: SectionId;
  phase: string;
  index: number;
  total: number;
}

export interface SectionContext {
  db: DatabaseSync;
  fetcher: SectionFetcher;
  now: string;
  /** Caps each loop of pages (listings, fragments) - for a pilot run. */
  limit?: number;
  /** false: answer from the cache for every URL fetched before (re-parse without touching the site). */
  revalidate: boolean;
  result: SectionResult;
  onProgress?: (progress: SectionProgress) => void;
  /** Bodies already read this run, so an entry page that is also the first list page is fetched once. */
  memo: Map<string, string>;
}

export function newResult(section: SectionId): SectionResult {
  return { section, pages: 0, changedPages: 0, checked: 0, inserted: 0, updated: 0, unchanged: 0, newIds: [], missingIds: [], warnings: [] };
}

/** Fetches (or re-reads) one page and records it in `section_pages`. */
export async function fetchPage(ctx: SectionContext, url: string): Promise<string> {
  const memoized = ctx.memo.get(url);
  if (memoized !== undefined) return memoized;
  const { body, etag, changed } = await ctx.fetcher.fetchWithRevalidation(url, { revalidate: ctx.revalidate });
  ctx.memo.set(url, body);
  ctx.result.pages += 1;
  if (changed) ctx.result.changedPages += 1;

  const bodyHash = hashValue(body);
  const existing = ctx.db.prepare('SELECT body_hash FROM section_pages WHERE url = ?').get(url) as { body_hash: string } | undefined;
  if (!existing) {
    ctx.db
      .prepare('INSERT INTO section_pages (url, section, etag, body_hash, first_seen_at, last_crawled_at, last_changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(url, ctx.result.section, etag, bodyHash, ctx.now, ctx.now, ctx.now);
  } else if (existing.body_hash !== bodyHash) {
    ctx.db.prepare('UPDATE section_pages SET etag = ?, body_hash = ?, last_crawled_at = ?, last_changed_at = ? WHERE url = ?').run(etag, bodyHash, ctx.now, ctx.now, url);
  } else {
    ctx.db.prepare('UPDATE section_pages SET etag = ?, last_crawled_at = ? WHERE url = ?').run(etag, ctx.now, url);
  }
  return body;
}

/** Fetches a list of pages in order, reporting progress; honours `limit`. */
export async function fetchEach<T>(ctx: SectionContext, phase: string, items: readonly T[], urlFor: (item: T) => string): Promise<Array<{ item: T; raw: string }>> {
  const chosen = limitList(ctx, items);
  const pages: Array<{ item: T; raw: string }> = [];
  for (let i = 0; i < chosen.length; i++) {
    const item = chosen[i]!;
    pages.push({ item, raw: await fetchPage(ctx, urlFor(item)) });
    ctx.onProgress?.({ section: ctx.result.section, phase, index: i + 1, total: chosen.length });
  }
  return pages;
}

export function limitList<T>(ctx: SectionContext, items: readonly T[]): T[] {
  return ctx.limit === undefined ? [...items] : items.slice(0, ctx.limit);
}

export function countStatus(ctx: SectionContext, status: ChangeStatus): void {
  ctx.result.checked += 1;
  ctx.result[status] += 1;
}

/** Replaces one side-nav. An empty parse keeps what the database had (a layout change should not wipe the nav) and warns. */
export function saveNav(ctx: SectionContext, section: SectionId, kind: string, entries: NavEntry[]): void {
  if (entries.length === 0) {
    ctx.result.warnings.push(`${section}/${kind}: the side-nav parsed empty; kept the stored one`);
    return;
  }
  replaceRows(
    ctx.db,
    'nav_entries',
    { section, kind },
    entries.map((entry) => ({ section, kind, slug: entry.slug, name: entry.name, ord: entry.ord })),
  );
}

/** Replaces what one page lists, and says whether that changed. */
export function saveMembership(ctx: SectionContext, section: SectionId, kind: string, page: MembershipPage): ChangeStatus {
  const before = (
    ctx.db.prepare('SELECT item_id FROM memberships WHERE section = ? AND kind = ? AND slug = ? ORDER BY ord').all(section, kind, page.slug) as Array<{ item_id: string }>
  ).map((row) => row.item_id);
  const unique = [...new Set(page.itemIds)];
  replaceRows(
    ctx.db,
    'memberships',
    { section, kind, slug: page.slug },
    unique.map((itemId, index) => ({ section, kind, slug: page.slug, item_id: itemId, ord: index + 1 })),
  );
  if (before.length === 0) return unique.length === 0 ? 'unchanged' : 'inserted';
  return before.join('\n') === unique.join('\n') ? 'unchanged' : 'updated';
}

/** Records new and missing ids for a tracked item table. Skipped on a `limit` run. */
export function finishIds(ctx: SectionContext, before: string[], seen: Iterable<string>): void {
  const status = syncStatus(before, seen);
  ctx.result.newIds = status.newIds;
  ctx.result.missingIds = ctx.limit === undefined ? status.missingIds : [];
}

export function knownIds(db: DatabaseSync, table: string, idColumn: string): string[] {
  return (db.prepare(`SELECT ${idColumn} AS id FROM ${table}`).all() as Array<{ id: string | number }>).map((row) => String(row.id));
}

export function inTransaction(db: DatabaseSync, write: () => void): void {
  db.exec('BEGIN');
  try {
    write();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** mafteiach month tokens are two-digit with an A/B suffix for a leap year's Adar: `5` -> "05", `6A` -> "06A". */
export function monthToken(raw: string): string | null {
  const match = /^(\d{1,2})([AB]?)$/.exec(raw);
  if (!match) return null;
  return `${match[1]!.padStart(2, '0')}${match[2]}`;
}

export function flag(value: boolean): number {
  return value ? 1 : 0;
}
