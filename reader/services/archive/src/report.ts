import { ArchiveStore } from './store.js';

export interface ArchiveStats {
  /** `lost`: objects whose bytes the last `verify` found missing or corrupt; the next crawl brings them back. */
  objects: { count: number; bytes: number; audio: number; pdf: number; text: number; lost: number };
  wanted: { urls: number; fetched: number; unresolved: number; errored: number; pending: number };
  refs: number;
  commits: number;
  lastCommit: { id: string; author: string; message: string; created_at: string } | null;
}

export function stats(store: ArchiveStore): ArchiveStats {
  const db = store.db;
  const objects = db.prepare("SELECT count(*) AS count, coalesce(sum(bytes), 0) AS bytes, sum(kind = 'audio') AS audio, sum(kind = 'pdf') AS pdf, sum(kind = 'text') AS text FROM objects").get() as ArchiveStats['objects'];
  const lost = (db.prepare('SELECT count(*) AS n FROM objects o WHERE coalesce((SELECT ok FROM verifications v WHERE v.sha256 = o.sha256 ORDER BY verified_at DESC LIMIT 1), 1) = 0').get() as { n: number }).n;
  const urls = (db.prepare('SELECT count(*) AS n FROM (SELECT DISTINCT source, url FROM wanted)').get() as { n: number }).n;
  const byStatus = db.prepare('SELECT status, count(*) AS n FROM sources GROUP BY status').all() as Array<{ status: string; n: number }>;
  const count = (status: string) => byStatus.find((r) => r.status === status)?.n ?? 0;
  const fetched = count('ok');
  const unresolved = count('unresolved');
  const errored = count('error');
  return {
    objects: { count: objects.count, bytes: objects.bytes, audio: objects.audio ?? 0, pdf: objects.pdf ?? 0, text: objects.text ?? 0, lost },
    wanted: { urls, fetched, unresolved, errored, pending: Math.max(0, urls - fetched - unresolved - errored) },
    refs: (db.prepare('SELECT count(*) AS n FROM refs WHERE removed_commit IS NULL').get() as { n: number }).n,
    commits: (db.prepare('SELECT count(*) AS n FROM commits').get() as { n: number }).n,
    lastCommit: (db.prepare('SELECT id, author, message, created_at FROM commits ORDER BY created_at DESC, rowid DESC LIMIT 1').get() as ArchiveStats['lastCommit']) ?? null,
  };
}

export interface UnresolvedItem {
  collection: string;
  item_id: string;
  hebrew_year: number | null;
  hebrew_date: string | null;
  files: Array<{ kind: string; source_id: string; role: string; label: string | null; url: string; http_status: number | null; error: string | null; attempts: number }>;
}

/** Everything an item wants that the archive could not fetch, grouped by item - the list to fix upstream (re-locate on mafteiach, find a resource key). */
export function unresolved(store: ArchiveStore): UnresolvedItem[] {
  const rows = store.db
    .prepare(
      `SELECT w.collection, w.item_id, w.hebrew_year, w.hebrew_date, w.kind, w.source_id, w.role, w.label, w.url, s.http_status, s.error, s.attempts
       FROM wanted w JOIN sources s ON s.source = w.source AND s.url = w.url
       WHERE s.status IN ('unresolved', 'error') ORDER BY w.collection, w.hebrew_year, w.hebrew_date, w.item_id, w.role`,
    )
    .all() as Array<{ collection: string; item_id: string; hebrew_year: number | null; hebrew_date: string | null; kind: string; source_id: string; role: string; label: string | null; url: string; http_status: number | null; error: string | null; attempts: number }>;
  const items = new Map<string, UnresolvedItem>();
  for (const row of rows) {
    const key = `${row.collection}:${row.item_id}`;
    let item = items.get(key);
    if (!item) {
      item = { collection: row.collection, item_id: row.item_id, hebrew_year: row.hebrew_year, hebrew_date: row.hebrew_date, files: [] };
      items.set(key, item);
    }
    item.files.push({ kind: row.kind, source_id: row.source_id, role: row.role, label: row.label, url: row.url, http_status: row.http_status, error: row.error, attempts: row.attempts });
  }
  return [...items.values()];
}
