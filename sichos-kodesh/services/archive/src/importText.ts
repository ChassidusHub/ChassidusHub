import { createHash } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { nowIso } from './db.js';
import type { ArchiveStore } from './store.js';

/**
 * Text that arrives as data rather than as a file to fetch - the Igros and
 * Maanos, built locally by packages/igros-index - stored like any other
 * object: by the sha256 of its bytes, under a commit, with a `wanted` row
 * (source `contribution`, url `text:<collection>/<item id>`) and a ref from
 * the item. Importing the same text again adds nothing; an edited text gets
 * a new object and the item's ref moves to it (the old one is retired, as
 * when an upstream file changes).
 *
 * The archive keeps everything; whether a collection may ship is the pack
 * builder's question (packages/catalog/src/rights.ts).
 */

export interface TextRecord {
  collection: string;
  itemId: string;
  /** The text object's content (UTF-8). */
  text: string;
  mime: string;
  label?: string;
  hebrewYear?: number | null;
  ord?: number;
}

export interface ImportTextOptions {
  author: string;
  message: string;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface ImportTextResult {
  records: number;
  /** Objects whose bytes were new to the archive. */
  added: number;
  /** Items whose text was already stored exactly so. */
  unchanged: number;
  /** Items whose text changed since the last import (their ref moved). */
  changed: number;
  bytes: number;
  commitId: string | null;
}

const UPSERT_WANTED = `
INSERT INTO wanted (collection, item_id, kind, source_id, role, source, url, resource_key, label, ord, duration_ms, hebrew_year, hebrew_date, seen_at)
VALUES (?, ?, 'text', ?, '', 'contribution', ?, NULL, ?, ?, NULL, ?, NULL, ?)
ON CONFLICT(collection, item_id, kind, source_id, role) DO UPDATE SET
  source = excluded.source, url = excluded.url, label = excluded.label, ord = excluded.ord, hebrew_year = excluded.hebrew_year, seen_at = excluded.seen_at`;

const UPSERT_SOURCE = `
INSERT INTO sources (source, url, sha256, status, http_status, etag, last_modified, content_type, error, attempts, fetched_at)
VALUES ('contribution', ?, ?, 'ok', NULL, NULL, NULL, ?, NULL, 1, ?)
ON CONFLICT(source, url) DO UPDATE SET sha256 = excluded.sha256, status = 'ok', content_type = excluded.content_type, error = NULL, fetched_at = excluded.fetched_at`;

const RETIRE_REFS = `UPDATE refs SET removed_commit = ? WHERE collection = ? AND item_id = ? AND kind = 'text' AND sha256 = ? AND removed_commit IS NULL`;

// A text changed back to an earlier version revives that version's retired ref.
const INSERT_REF = `
INSERT INTO refs (collection, item_id, sha256, kind, source_id, role, label, ord, duration_ms, commit_id)
VALUES (?, ?, ?, 'text', ?, '', ?, ?, NULL, ?)
ON CONFLICT(collection, item_id, sha256, role) DO UPDATE SET removed_commit = NULL`;

export function textUrl(collection: string, itemId: string): string {
  return `text:${collection}/${itemId}`;
}

export async function importText(store: ArchiveStore, records: readonly TextRecord[], options: ImportTextOptions): Promise<ImportTextResult> {
  const result: ImportTextResult = { records: records.length, added: 0, unchanged: 0, changed: 0, bytes: 0, commitId: null };
  const previousSha = store.db.prepare("SELECT sha256 FROM sources WHERE source = 'contribution' AND url = ?");
  const plan = records.map((record) => {
    const bytes = Buffer.from(record.text, 'utf8');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const url = textUrl(record.collection, record.itemId);
    const previous = (previousSha.get(url) as { sha256: string | null } | undefined)?.sha256 ?? null;
    return { record, bytes, sha256, url, previous };
  });
  for (const { bytes, sha256, previous } of plan) {
    if (previous === sha256) result.unchanged += 1;
    else {
      if (previous) result.changed += 1;
      if (!store.hasObject(sha256)) {
        result.added += 1;
        result.bytes += bytes.length;
      }
    }
  }
  if (options.dryRun) return result;

  const seenAt = nowIso();
  const upsertWanted = store.db.prepare(UPSERT_WANTED);
  store.db.exec('BEGIN');
  try {
    for (const { record, url } of plan) {
      upsertWanted.run(record.collection, record.itemId, record.itemId, url, record.label ?? null, record.ord ?? null, record.hebrewYear ?? null, seenAt);
    }
    store.db.exec('COMMIT');
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  }

  const pending = plan.filter((entry) => entry.previous !== entry.sha256);
  if (pending.length === 0) return result;
  const commitId = store.beginCommit(options.author, options.message);
  result.commitId = commitId;
  const upsertSource = store.db.prepare(UPSERT_SOURCE);
  const retireRefs = store.db.prepare(RETIRE_REFS);
  const insertRef = store.db.prepare(INSERT_REF);
  for (const { record, bytes, sha256, url, previous } of pending) {
    if (!(await store.objectExistsOnDisk(sha256))) {
      const tmp = store.tmpPath();
      await writeFile(tmp, bytes);
      const placed = await store.putObject(tmp, sha256, bytes.length, 'text', null, record.mime, commitId);
      if (!placed) await unlink(tmp).catch(() => undefined);
    } else if (!store.hasObject(sha256)) {
      store.db
        .prepare('INSERT OR IGNORE INTO objects (sha256, bytes, kind, profile, mime, commit_id, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?)')
        .run(sha256, bytes.length, 'text', record.mime, commitId, nowIso());
    }
    upsertSource.run(url, sha256, record.mime, nowIso());
    if (previous) retireRefs.run(commitId, record.collection, record.itemId, previous);
    insertRef.run(record.collection, record.itemId, sha256, record.itemId, record.label ?? null, record.ord ?? null, commitId);
  }
  options.log?.(`import-text: ${pending.length} item(s) stored under commit ${commitId.slice(0, 12)}`);
  return result;
}
