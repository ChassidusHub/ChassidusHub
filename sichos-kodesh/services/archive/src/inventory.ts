import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { extractDriveFileId, extractDriveResourceKey } from '@sichos-kodesh/catalog';
import { nowIso } from './db.js';
import type { ArchiveStore } from './store.js';

/**
 * The inventory is what the archive should hold, read from the two
 * indexers' databases - the archive never crawls mafteiach or JEM's API
 * itself, it fetches the files those indexes point at:
 *
 *   jem.db        every JEM recording (8,142; 2,722 h) -> audio objects,
 *                 one `jemEvents` item per ccdb event, and a `farbrengens`
 *                 ref for the ones mafteiach links to an occasion
 *   mafteiach.db  every Drive link by occasion and section -> pdf objects
 *                 under `farbrengens`
 *
 * Re-running is an upsert: rows carry `seen_at`, so a later "no longer in
 * any index" report is possible without deleting history.
 */

export interface InventoryOptions {
  jemDb?: string;
  mafteiachDb?: string;
}

export interface InventoryResult {
  audio: number;
  pdfs: number;
  farbrengenAudioRefs: number;
  skipped: { nonDriveLinks: number; badDriveUrls: number };
}

const UPSERT = `
INSERT INTO wanted (collection, item_id, kind, source_id, role, source, url, resource_key, label, ord, duration_ms, hebrew_year, hebrew_date, seen_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(collection, item_id, kind, source_id, role) DO UPDATE SET
  url = excluded.url, resource_key = excluded.resource_key, label = excluded.label, ord = excluded.ord,
  duration_ms = excluded.duration_ms, hebrew_year = excluded.hebrew_year, hebrew_date = excluded.hebrew_date, seen_at = excluded.seen_at`;

export function jemFilename(url: string): string {
  return path.posix.basename(new URL(url).pathname);
}

export function loadInventory(store: ArchiveStore, options: InventoryOptions): InventoryResult {
  const result: InventoryResult = { audio: 0, pdfs: 0, farbrengenAudioRefs: 0, skipped: { nonDriveLinks: 0, badDriveUrls: 0 } };
  const seenAt = nowIso();
  const upsert = store.db.prepare(UPSERT);

  if (options.jemDb) {
    const jem = new DatabaseSync(options.jemDb, { readOnly: true });
    try {
      const rows = jem
        .prepare(
          `SELECT r.event_id, r.ccdb_recording_id, r.name, r.duration_ms, r.url, e.hebrew_year, e.hebrew_month, e.hebrew_day
           FROM audio_recordings r LEFT JOIN events e ON e.id = r.event_id ORDER BY r.event_id, r.ccdb_recording_id`,
        )
        .all() as Array<{ event_id: number; ccdb_recording_id: number; name: string | null; duration_ms: number | null; url: string; hebrew_year: number | null; hebrew_month: number | null; hebrew_day: number | null }>;
      let ord = 0;
      let lastEvent: number | null = null;
      store.db.exec('BEGIN');
      for (const row of rows) {
        if (row.event_id !== lastEvent) {
          ord = 0;
          lastEvent = row.event_id;
        }
        const filename = jemFilename(row.url);
        upsert.run('jemEvents', String(row.event_id), 'audio', filename, String(ord), 'jem', row.url, null, row.name, ord, row.duration_ms, row.hebrew_year, null, seenAt);
        ord += 1;
        result.audio += 1;
      }
      store.db.exec('COMMIT');
    } finally {
      jem.close();
    }
  }

  if (options.mafteiachDb) {
    const maf = new DatabaseSync(options.mafteiachDb, { readOnly: true });
    try {
      const links = maf
        .prepare(
          `SELECT l.occasion_id, l.section, l.label, l.url, o.hebrew_year, o.hebrew_date
           FROM links l JOIN occasions o ON o.id = l.occasion_id
           WHERE l.url LIKE '%drive.google.com%' OR l.url LIKE '%docs.google.com%' ORDER BY l.occasion_id, l.rowid`,
        )
        .all() as Array<{ occasion_id: number; section: string; label: string | null; url: string; hebrew_year: number; hebrew_date: string }>;
      const nonDrive = (maf.prepare("SELECT count(*) AS n FROM links WHERE url NOT LIKE '%drive.google.com%' AND url NOT LIKE '%docs.google.com%'").get() as { n: number }).n;
      result.skipped.nonDriveLinks = nonDrive;
      store.db.exec('BEGIN');
      for (const link of links) {
        const fileId = extractDriveFileId(link.url);
        if (!fileId) {
          result.skipped.badDriveUrls += 1;
          continue;
        }
        const resourceKey = extractDriveResourceKey(link.url);
        upsert.run('farbrengens', String(link.occasion_id), 'pdf', fileId, link.section, 'drive', link.url, resourceKey, link.label, null, null, link.hebrew_year, link.hebrew_date, seenAt);
        result.pdfs += 1;
      }
      const audio = maf
        .prepare(
          `SELECT j.occasion_id, j.chapter_index, j.chapter_name, j.duration_ms, j.url, o.hebrew_year, o.hebrew_date
           FROM jem_audio j JOIN occasions o ON o.id = j.occasion_id ORDER BY j.occasion_id, j.chapter_index`,
        )
        .all() as Array<{ occasion_id: number; chapter_index: number; chapter_name: string | null; duration_ms: number | null; url: string; hebrew_year: number; hebrew_date: string }>;
      for (const row of audio) {
        upsert.run('farbrengens', String(row.occasion_id), 'audio', jemFilename(row.url), String(row.chapter_index), 'jem', row.url, null, row.chapter_name, row.chapter_index, row.duration_ms, row.hebrew_year, row.hebrew_date, seenAt);
        result.farbrengenAudioRefs += 1;
      }
      store.db.exec('COMMIT');
    } finally {
      maf.close();
    }
  }
  return result;
}
