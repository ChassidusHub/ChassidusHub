import type { DatabaseSync } from 'node:sqlite';

/**
 * Change tracking for the section tables, in the same spirit as
 * `upsertRecord` for occasions: a row carries a content hash and three
 * timestamps, and a re-crawl only bumps `last_changed_at` (and rewrites
 * child rows) when the content actually differs. Kept separate from
 * `db.ts` so the farbrengens path stays exactly as it is.
 *
 * Table and column names only ever come from the section modules' own
 * constants - never from crawled data - so interpolating them is safe.
 */

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The same cheap fingerprint `contentHash` uses - change detection, not cryptography. */
export function hashValue(value: unknown): string {
  const normalized = stableStringify(value);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) hash = (Math.imul(hash, 31) + normalized.charCodeAt(i)) | 0;
  return hash.toString(36);
}

export type ChangeStatus = 'inserted' | 'updated' | 'unchanged';

export interface TrackResult {
  status: ChangeStatus;
  firstSeenAt: string;
  lastChangedAt: string;
}

/** Compares `hash` with the stored row's and returns the bookkeeping values the caller writes back. Does not write. */
export function trackChange(db: DatabaseSync, table: string, idColumn: string, id: string | number, hash: string, now: string): TrackResult {
  const existing = db.prepare(`SELECT content_hash, first_seen_at, last_changed_at FROM ${table} WHERE ${idColumn} = ?`).get(id) as
    | { content_hash: string; first_seen_at: string; last_changed_at: string }
    | undefined;
  if (!existing) return { status: 'inserted', firstSeenAt: now, lastChangedAt: now };
  if (existing.content_hash === hash) return { status: 'unchanged', firstSeenAt: existing.first_seen_at, lastChangedAt: existing.last_changed_at };
  return { status: 'updated', firstSeenAt: existing.first_seen_at, lastChangedAt: now };
}

export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

/**
 * Writes one tracked item row: every column in `row` plus the four
 * bookkeeping columns, inserted or updated in place. Returns what changed,
 * so the caller rewrites the item's child rows only when it has to.
 */
export function upsertTracked(db: DatabaseSync, table: string, idColumn: string, row: Row, hash: string, now: string): ChangeStatus {
  const id = row[idColumn];
  if (id === undefined || id === null) throw new Error(`${table}: row without ${idColumn}`);
  const tracked = trackChange(db, table, idColumn, id, hash, now);
  const full: Row = { ...row, content_hash: hash, first_seen_at: tracked.firstSeenAt, last_crawled_at: now, last_changed_at: tracked.lastChangedAt };
  const columns = Object.keys(full);
  const updates = columns.filter((c) => c !== idColumn && c !== 'first_seen_at').map((c) => `${c} = excluded.${c}`);
  db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT(${idColumn}) DO UPDATE SET ${updates.join(', ')}`).run(
    ...columns.map((c) => full[c] ?? null),
  );
  return tracked.status;
}

/** Deletes every row of `table` matching `where` (all columns equal) and inserts `rows` in their place - the child rows of one item, or one page's membership. */
export function replaceRows(db: DatabaseSync, table: string, where: Row, rows: Row[]): void {
  const keys = Object.keys(where);
  db.prepare(`DELETE FROM ${table} WHERE ${keys.map((k) => `${k} = ?`).join(' AND ')}`).run(...keys.map((k) => where[k] ?? null));
  for (const row of rows) {
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map((c) => row[c] ?? null));
  }
}

/** Which ids appeared for the first time and which known ids the site no longer lists (reported, never deleted - same policy as `syncAll`). */
export function syncStatus(before: Iterable<string>, seen: Iterable<string>): { newIds: string[]; missingIds: string[] } {
  const known = new Set(before);
  const live = new Set(seen);
  return { newIds: [...live].filter((id) => !known.has(id)), missingIds: [...known].filter((id) => !live.has(id)) };
}
