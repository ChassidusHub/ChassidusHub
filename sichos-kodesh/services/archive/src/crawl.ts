import { unlink } from 'node:fs/promises';
import type { AudioProfile, ObjectKind } from '@sichos-kodesh/pack-format';
import { nowIso } from './db.js';
import { fetchDriveToFile, fetchToFile, type FetchOptions } from './fetch.js';
import { ArchiveStore, hashFile } from './store.js';

/**
 * The crawler works the inventory: every (source, url) some item wants and
 * no ok `sources` row exists for is fetched once, hashed, stored, and
 * turned into refs for every item that wanted it. One commit per run, by
 * the bot author "crawl". Failures are recorded (status, attempts, error)
 * and retried on the next run up to a cap; a file that upstream says is
 * gone (4xx) is `unresolved` and shows in `report-unresolved`.
 */

export interface CrawlOptions extends FetchOptions {
  limit?: number;
  source?: 'jem' | 'drive';
  /** Only the files of one collection's items. */
  collection?: string;
  /**
   * Only the files of items dated in this scope: a Hebrew year (`5736`) or
   * a year and mafteiach month token (`5736-01`, `5746-06B`). What a pack
   * build for that scope needs, without waiting for the whole archive.
   */
  scope?: string;
  dryRun?: boolean;
  /** Stop retrying a url after this many failed runs. */
  maxRunsPerUrl?: number;
  log?: (line: string) => void;
}

export interface CrawlResult {
  attempted: number;
  fetched: number;
  bytes: number;
  unresolved: number;
  errors: number;
  skippedExisting: number;
  commitId: string | null;
}

interface WantedUrl {
  source: 'jem' | 'drive';
  url: string;
  kind: ObjectKind;
  source_id: string;
  resource_key: string | null;
  attempts: number | null;
  status: string | null;
  /** The object this url produced last time (`verify` sends a url back with its hash kept). */
  previous_sha256: string | null;
}

const PENDING_URLS = `
SELECT w.source, w.url, w.kind, w.source_id, w.resource_key, s.attempts, s.status, s.sha256 AS previous_sha256
FROM (
  SELECT DISTINCT source, url, kind, source_id, resource_key FROM wanted
  WHERE (:collection = '' OR collection = :collection)
    AND (:year IS NULL OR hebrew_year = :year)
    AND (:datePrefix = '' OR hebrew_date LIKE :datePrefix || '-%')
) w
LEFT JOIN sources s ON s.source = w.source AND s.url = w.url
WHERE (s.status IS NULL OR s.status = 'error')
  AND (:source = '' OR w.source = :source)
ORDER BY w.source, w.url
LIMIT :limit`;

const SCOPE = /^(\d{4})(?:-(\d{2}[AB]?))?$/;

/** `5736` -> the year; `5736-01` -> the year and the `hebrew_date` prefix of its month. */
export function parseCrawlScope(scope: string): { year: number; datePrefix: string } {
  const match = SCOPE.exec(scope.trim());
  if (!match) throw new Error(`scope must be a Hebrew year (5736) or a year and month token (5736-01, 5746-06B), not "${scope}"`);
  return { year: Number(match[1]), datePrefix: match[2] ? `${match[1]}-${match[2]}` : '' };
}

const UPSERT_SOURCE = `
INSERT INTO sources (source, url, sha256, status, http_status, etag, last_modified, content_type, error, attempts, fetched_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(source, url) DO UPDATE SET
  sha256 = excluded.sha256, status = excluded.status, http_status = excluded.http_status, etag = excluded.etag,
  last_modified = excluded.last_modified, content_type = excluded.content_type, error = excluded.error,
  attempts = excluded.attempts, fetched_at = excluded.fetched_at`;

/** Upstream replaced the file: the items' refs to the old bytes end at this commit and refs to the new bytes begin. */
const RETIRE_REFS = `
UPDATE refs SET removed_commit = ? WHERE sha256 = ? AND removed_commit IS NULL
  AND (collection, item_id, role) IN (SELECT collection, item_id, role FROM wanted WHERE source = ? AND url = ?)`;

const INSERT_REF = `
INSERT OR IGNORE INTO refs (collection, item_id, sha256, kind, source_id, role, label, ord, duration_ms, commit_id)
SELECT collection, item_id, ?, kind, source_id, role, label, ord, duration_ms, ? FROM wanted WHERE source = ? AND url = ?`;

function mimeFor(kind: ObjectKind, contentType: string | null): string | null {
  if (contentType && !contentType.includes('text/html')) return contentType.split(';')[0]!.trim();
  return kind === 'audio' ? 'audio/mpeg' : kind === 'pdf' ? 'application/pdf' : null;
}

export async function crawl(store: ArchiveStore, options: CrawlOptions = {}): Promise<CrawlResult> {
  const log = options.log ?? (() => undefined);
  const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
  const maxRuns = options.maxRunsPerUrl ?? 8;
  const scope = options.scope ? parseCrawlScope(options.scope) : null;
  const rows = store.db.prepare(PENDING_URLS).all({
    source: options.source ?? '',
    collection: options.collection ?? '',
    year: scope?.year ?? null,
    datePrefix: scope?.datePrefix ?? '',
    limit,
  }) as unknown as WantedUrl[];
  const result: CrawlResult = { attempted: 0, fetched: 0, bytes: 0, unresolved: 0, errors: 0, skippedExisting: 0, commitId: null };
  const pending = rows.filter((row) => (row.attempts ?? 0) < maxRuns);
  if (pending.length === 0 || options.dryRun) {
    if (options.dryRun) log(`dry run: ${pending.length} url(s) would be fetched (${rows.length - pending.length} past the retry cap)`);
    return result;
  }
  const commitId = store.beginCommit('crawl', `crawl ${nowIso()}: up to ${pending.length} file(s)`);
  result.commitId = commitId;
  const upsertSource = store.db.prepare(UPSERT_SOURCE);
  const retireRefs = store.db.prepare(RETIRE_REFS);
  const insertRef = store.db.prepare(INSERT_REF);
  const concurrency = Math.max(1, options.concurrency ?? 2);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const row = pending[cursor];
      cursor += 1;
      if (!row) return;
      result.attempted += 1;
      const attempts = (row.attempts ?? 0) + 1;
      const tmp = store.tmpPath();
      const outcome = row.source === 'drive' ? await fetchDriveToFile(row.source_id, row.resource_key, tmp, options) : await fetchToFile(row.url, tmp, options);
      if (outcome.status !== 'ok') {
        await unlink(tmp).catch(() => undefined);
        const status = outcome.status === 'unresolved' ? 'unresolved' : 'error';
        upsertSource.run(row.source, row.url, row.previous_sha256, status, outcome.status === 'not-modified' ? 304 : outcome.httpStatus, null, null, null, outcome.status === 'not-modified' ? null : outcome.error, attempts, nowIso());
        if (status === 'unresolved') result.unresolved += 1;
        else result.errors += 1;
        log(`${status}: ${row.source} ${row.source_id} (${outcome.status === 'not-modified' ? '304' : outcome.error})`);
        continue;
      }
      const { sha256, bytes } = await hashFile(tmp);
      const profile: AudioProfile | null = row.kind === 'audio' ? 'src' : null;
      const placed = await store.putObject(tmp, sha256, bytes, row.kind, profile, mimeFor(row.kind, outcome.contentType), commitId);
      if (placed) {
        result.fetched += 1;
        result.bytes += bytes;
      } else {
        await unlink(tmp).catch(() => undefined);
        result.skippedExisting += 1;
      }
      upsertSource.run(row.source, row.url, sha256, 'ok', outcome.httpStatus, outcome.etag, outcome.lastModified, outcome.contentType, null, attempts, nowIso());
      if (row.previous_sha256 && row.previous_sha256 !== sha256) retireRefs.run(commitId, row.previous_sha256, row.source, row.url);
      insertRef.run(sha256, commitId, row.source, row.url);
      log(`ok: ${row.source} ${row.source_id} ${bytes} B ${sha256.slice(0, 12)}${placed ? '' : ' (already stored)'}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()));
  return result;
}
