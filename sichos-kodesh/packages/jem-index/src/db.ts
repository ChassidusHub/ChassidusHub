import { DatabaseSync } from 'node:sqlite';
import type { CcdbDate, JemAudioRecordingRow, JemEventNode } from './types.js';

/**
 * An independent index of JEM's own ccdb catalog - deliberately not keyed
 * off packages/mafteiach-index's occasion ids, so this stands on its own
 * as "what does JEM say exists" (dates, names, audio) regardless of
 * whether mafteiach.app ever linked to it. `first_seen_at` /
 * `last_changed_at` / `content_hash` follow the same incremental-sync
 * pattern as mafteiach-index's db.ts, for the same reason: a re-crawl of
 * unchanged content should only touch crawl bookkeeping.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      has_long_description INTEGER NOT NULL,
      has_transcript INTEGER NOT NULL,
      has_own_audio INTEGER NOT NULL,

      -- Denormalized from the first entry in the ccdb dates array (every
      -- real example seen has exactly one) - kept as real columns, not a
      -- JSON blob, so "every event on Hebrew date X" is a plain indexed query.
      hebrew_year INTEGER,
      hebrew_month INTEGER,
      hebrew_day INTEGER,
      hebrew_month_name TEXT,
      secular_year INTEGER,
      secular_month INTEGER,
      secular_day INTEGER,
      after_nightfall INTEGER,

      content_hash TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_crawled_at TEXT NOT NULL,
      last_changed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_parent ON events(parent_id);
    CREATE INDEX IF NOT EXISTS idx_events_hebrew_date ON events(hebrew_year, hebrew_month, hebrew_day);

    CREATE TABLE IF NOT EXISTS audio_recordings (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      ccdb_recording_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      url TEXT NOT NULL,
      file_format TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audio_recordings_event ON audio_recordings(event_id);
  `);
  return db;
}

function contentHash(node: JemEventNode): string {
  const normalized = JSON.stringify(node);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (Math.imul(hash, 31) + normalized.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function primaryDate(dates: CcdbDate[]): CcdbDate | null {
  return dates[0] ?? null;
}

export interface UpsertResult {
  status: 'inserted' | 'updated' | 'unchanged';
}

export function upsertEvent(db: DatabaseSync, node: JemEventNode, now: string): UpsertResult {
  const hash = contentHash(node);
  const existing = db.prepare('SELECT content_hash, first_seen_at, last_changed_at FROM events WHERE id = ?').get(node.id) as
    | { content_hash: string; first_seen_at: string; last_changed_at: string }
    | undefined;

  const unchanged = existing?.content_hash === hash;
  const firstSeenAt = existing?.first_seen_at ?? now;
  const lastChangedAt = unchanged ? existing!.last_changed_at : now;
  const date = primaryDate(node.dates);

  db.prepare(
    `INSERT INTO events (
      id, parent_id, name, type, has_long_description, has_transcript, has_own_audio,
      hebrew_year, hebrew_month, hebrew_day, hebrew_month_name,
      secular_year, secular_month, secular_day, after_nightfall,
      content_hash, first_seen_at, last_crawled_at, last_changed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      parent_id=excluded.parent_id, name=excluded.name, type=excluded.type,
      has_long_description=excluded.has_long_description, has_transcript=excluded.has_transcript, has_own_audio=excluded.has_own_audio,
      hebrew_year=excluded.hebrew_year, hebrew_month=excluded.hebrew_month, hebrew_day=excluded.hebrew_day, hebrew_month_name=excluded.hebrew_month_name,
      secular_year=excluded.secular_year, secular_month=excluded.secular_month, secular_day=excluded.secular_day, after_nightfall=excluded.after_nightfall,
      content_hash=excluded.content_hash, last_crawled_at=excluded.last_crawled_at, last_changed_at=excluded.last_changed_at`,
  ).run(
    node.id,
    node.parentId,
    node.name,
    node.type,
    node.hasLongDescription ? 1 : 0,
    node.hasTranscript ? 1 : 0,
    node.hasOwnAudio ? 1 : 0,
    date?.hebrew_year ?? null,
    date?.hebrew_month ?? null,
    date?.hebrew_day ?? null,
    date?.hebrew_month_name ?? null,
    date?.secular_year ?? null,
    date?.secular_month ?? null,
    date?.secular_day ?? null,
    date ? (date.after_nightfall ? 1 : 0) : null,
    hash,
    firstSeenAt,
    now,
    lastChangedAt,
  );

  return { status: existing === undefined ? 'inserted' : unchanged ? 'unchanged' : 'updated' };
}

export function replaceAudioRecordings(db: DatabaseSync, eventId: number, recordings: JemAudioRecordingRow[]): void {
  db.prepare('DELETE FROM audio_recordings WHERE event_id = ?').run(eventId);
  const insert = db.prepare(
    'INSERT INTO audio_recordings (event_id, ccdb_recording_id, name, duration_ms, url, file_format) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const r of recordings) {
    insert.run(r.eventId, r.ccdbRecordingId, r.name, r.durationMs, r.url, r.fileFormat);
  }
}

export function allKnownEventIds(db: DatabaseSync): number[] {
  return (db.prepare('SELECT id FROM events').all() as { id: number }[]).map((r) => r.id);
}
