import { DatabaseSync } from 'node:sqlite';
import type { FarbrengenRecord, LinkRef } from './types.js';

/**
 * The "smart DB": a queryable SQLite store for the crawled dataset, in
 * place of flat per-year JSON files. Built on `node:sqlite` (built into
 * Node 22+, no native-compile dependency) — experimental, but stable
 * enough for a local, single-writer tool like this one.
 *
 * Schema is deliberately denormalized just enough to make the app's real
 * question fast: "does year Y have a recording/mugah/hanacha for occasion
 * X" (`occasions` has one boolean column per section), while still
 * keeping the actual links in a normalized child table for anything that
 * needs the real URLs/citations. `first_seen_at` / `last_changed_at` /
 * `etag` back the incremental sync in `sync.ts` — a record is only
 * touched (and `last_changed_at` bumped) when its content actually
 * differs from what's stored, not on every sync run.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);

  // One-time migration: drops and rebuilds `jem_audio` if it predates the
  // `chapter_index`/`chapter_name` columns, rather than altering it in
  // place. The table is fully derived (re-resolvable from ccdb via
  // bin/resolveJemAudio.ts), unlike scraped ground truth such as
  // `occasions`/`links`, so dropping it is safe - the next resolve run
  // repopulates it correctly.
  const existingJemAudioColumns = db.prepare("PRAGMA table_info(jem_audio)").all() as { name: string }[];
  if (existingJemAudioColumns.length > 0 && !existingJemAudioColumns.some((c) => c.name === 'chapter_index')) {
    db.exec('DROP TABLE jem_audio');
  }

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS occasions (
      id INTEGER PRIMARY KEY,
      hebrew_year INTEGER NOT NULL,
      hebrew_date TEXT NOT NULL,
      is_pre_nesius INTEGER NOT NULL,
      occasion_label TEXT NOT NULL,

      has_mugah INTEGER NOT NULL,
      has_bilti_mugah INTEGER NOT NULL,
      has_maamorim INTEGER NOT NULL,
      has_audio INTEGER NOT NULL,
      has_video INTEGER NOT NULL,
      has_english INTEGER NOT NULL,
      has_tochen_inyanim INTEGER NOT NULL,
      has_hagahos INTEGER NOT NULL,
      has_hosofos INTEGER NOT NULL,

      tochen_inyanim_text TEXT,
      hosofos_text TEXT,

      etag TEXT,
      content_hash TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_crawled_at TEXT NOT NULL,
      last_changed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_occasions_year ON occasions(hebrew_year);
    CREATE INDEX IF NOT EXISTS idx_occasions_date ON occasions(hebrew_date);

    CREATE TABLE IF NOT EXISTS links (
      occasion_id INTEGER NOT NULL REFERENCES occasions(id) ON DELETE CASCADE,
      section TEXT NOT NULL,
      group_label TEXT,
      label TEXT NOT NULL,
      url TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_links_occasion ON links(occasion_id);

    CREATE TABLE IF NOT EXISTS video_ids (
      occasion_id INTEGER NOT NULL REFERENCES occasions(id) ON DELETE CASCADE,
      youtube_id TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_video_ids_occasion ON video_ids(occasion_id);

    -- Resolved via JEM's own "ccdb" API (see src/jemAudio.ts) from the ashreinu.app
    -- player links already in the links table above - the direct, playable CDN
    -- URL for each audio recording, not just the player-page link. One occasion
    -- can have several rows (a farbrengen's separate sichas/maamar, each its own
    -- recording) - chapter_index is their playback order (matching ccdb's own
    -- sub_events order), chapter_name their ccdb label (e.g. "Sicha 1",
    -- "Sicha 2", "Ma'amar") for a chapters-style player.
    CREATE TABLE IF NOT EXISTS jem_audio (
      occasion_id INTEGER NOT NULL REFERENCES occasions(id) ON DELETE CASCADE,
      ccdb_event_id INTEGER NOT NULL,
      chapter_index INTEGER NOT NULL,
      chapter_name TEXT,
      duration_ms INTEGER NOT NULL,
      url TEXT NOT NULL,
      file_format TEXT NOT NULL,
      resolved_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jem_audio_occasion ON jem_audio(occasion_id);
  `);
  return db;
}

/** A stable hash of everything about a record except crawl bookkeeping (etag/timestamps) - used to detect real content changes. */
export function contentHash(record: FarbrengenRecord): string {
  const { id, hebrewYear, hebrewDate, isPreNesius, occasionLabel, detail } = record;
  const normalized = JSON.stringify({ id, hebrewYear, hebrewDate, isPreNesius, occasionLabel, detail });
  // Not cryptographic - just a cheap deterministic fingerprint for change detection, so no need for a hashing dependency.
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (Math.imul(hash, 31) + normalized.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export interface UpsertResult {
  status: 'inserted' | 'updated' | 'unchanged';
}

/**
 * Inserts or updates one occasion. Only writes `links`/`video_ids` rows
 * and bumps `last_changed_at` when the content actually changed (or it's
 * new) - a re-sync of unchanged content only touches `last_crawled_at`.
 */
export function upsertRecord(db: DatabaseSync, record: FarbrengenRecord, etag: string | null, now: string): UpsertResult {
  const hash = contentHash(record);
  const existing = db.prepare('SELECT content_hash, first_seen_at FROM occasions WHERE id = ?').get(record.id) as
    | { content_hash: string; first_seen_at: string }
    | undefined;

  const unchanged = existing?.content_hash === hash;
  const firstSeenAt = existing?.first_seen_at ?? now;
  const lastChangedAt = unchanged ? (db.prepare('SELECT last_changed_at FROM occasions WHERE id = ?').get(record.id) as { last_changed_at: string }).last_changed_at : now;

  const d = record.detail;
  db.prepare(
    `INSERT INTO occasions (
      id, hebrew_year, hebrew_date, is_pre_nesius, occasion_label,
      has_mugah, has_bilti_mugah, has_maamorim, has_audio, has_video, has_english, has_tochen_inyanim, has_hagahos, has_hosofos,
      tochen_inyanim_text, hosofos_text,
      etag, content_hash, first_seen_at, last_crawled_at, last_changed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      hebrew_year=excluded.hebrew_year, hebrew_date=excluded.hebrew_date, is_pre_nesius=excluded.is_pre_nesius, occasion_label=excluded.occasion_label,
      has_mugah=excluded.has_mugah, has_bilti_mugah=excluded.has_bilti_mugah, has_maamorim=excluded.has_maamorim,
      has_audio=excluded.has_audio, has_video=excluded.has_video, has_english=excluded.has_english,
      has_tochen_inyanim=excluded.has_tochen_inyanim, has_hagahos=excluded.has_hagahos, has_hosofos=excluded.has_hosofos,
      tochen_inyanim_text=excluded.tochen_inyanim_text, hosofos_text=excluded.hosofos_text,
      etag=excluded.etag, content_hash=excluded.content_hash, last_crawled_at=excluded.last_crawled_at, last_changed_at=excluded.last_changed_at`,
  ).run(
    record.id,
    record.hebrewYear,
    record.hebrewDate,
    record.isPreNesius ? 1 : 0,
    record.occasionLabel,
    d.mugah.hasContent ? 1 : 0,
    d.biltiMugah.hasContent ? 1 : 0,
    d.maamorim.hasContent ? 1 : 0,
    d.audio.hasContent ? 1 : 0,
    d.video.hasContent ? 1 : 0,
    d.english.hasContent ? 1 : 0,
    d.tochenInyanim.hasContent ? 1 : 0,
    d.hagahos.hasContent ? 1 : 0,
    d.hosofos.hasContent ? 1 : 0,
    d.tochenInyanim.text,
    d.hosofos.text,
    etag,
    hash,
    firstSeenAt,
    now,
    lastChangedAt,
  );

  if (!unchanged) {
    db.prepare('DELETE FROM links WHERE occasion_id = ?').run(record.id);
    db.prepare('DELETE FROM video_ids WHERE occasion_id = ?').run(record.id);
    const insertLink = db.prepare('INSERT INTO links (occasion_id, section, group_label, label, url) VALUES (?, ?, ?, ?, ?)');
    const sections: Array<[string, LinkRef[]]> = [
      ['biltiMugah', d.biltiMugah.links],
      ['mugah', d.mugah.links],
      ['maamorim', d.maamorim.links],
      ['english', d.english.links],
      ['hagahos', d.hagahos.links],
      ['audio', d.audio.links],
      ['video', d.video.links],
      ['tochenInyanim', d.tochenInyanim.links],
      ['hosofos', d.hosofos.links],
    ];
    for (const [section, links] of sections) {
      for (const link of links) {
        insertLink.run(record.id, section, link.group ?? null, link.label, link.url);
      }
    }
    const insertVideo = db.prepare('INSERT INTO video_ids (occasion_id, youtube_id) VALUES (?, ?)');
    for (const youtubeId of d.video.youtubeIds) insertVideo.run(record.id, youtubeId);
  }

  return { status: existing === undefined ? 'inserted' : unchanged ? 'unchanged' : 'updated' };
}

export function getEtag(db: DatabaseSync, id: number): string | null {
  const row = db.prepare('SELECT etag FROM occasions WHERE id = ?').get(id) as { etag: string | null } | undefined;
  return row?.etag ?? null;
}

export function allKnownIds(db: DatabaseSync): number[] {
  return (db.prepare('SELECT id FROM occasions').all() as { id: number }[]).map((r) => r.id);
}

export interface ResolvedJemAudio {
  ccdbEventId: number;
  /** Playback/chapter order (0-based) - see jem_audio's own schema comment. Assigned by the caller from the resolved recording's position, not derived here, since one recording can flatten into more than one row (rare multi-format assets) that must share the same index. */
  chapterIndex: number;
  chapterName: string | null;
  durationMs: number;
  url: string;
  fileFormat: string;
}

/** Replaces any previously-resolved audio for this occasion with the freshly-resolved set (idempotent re-resolution, not an ever-growing append). */
export function replaceJemAudio(db: DatabaseSync, occasionId: number, recordings: ResolvedJemAudio[], now: string): void {
  db.prepare('DELETE FROM jem_audio WHERE occasion_id = ?').run(occasionId);
  const insert = db.prepare(
    'INSERT INTO jem_audio (occasion_id, ccdb_event_id, chapter_index, chapter_name, duration_ms, url, file_format, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const r of recordings) {
    insert.run(occasionId, r.ccdbEventId, r.chapterIndex, r.chapterName, r.durationMs, r.url, r.fileFormat, now);
  }
}
