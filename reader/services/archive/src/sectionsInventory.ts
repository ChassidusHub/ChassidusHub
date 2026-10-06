import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { extractDriveFileId, extractDriveResourceKey } from '@chassidushub-reader/catalog';
import type { CollectionId } from '@chassidushub-reader/pack-format';

/**
 * Inventory readers for the collections beyond the farbrengens, from the
 * tables `packages/mafteiach-index`'s section crawlers fill (see its
 * src/sections/schema.ts). Each reader runs only when its table exists, so
 * an older mafteiach.db (farbrengens only) inventories exactly as before.
 *
 *   likkuteiSichos   ls_links (the sicha and its translation)       item = '{volume}:{page}'
 *   maamorim         maamorim_links (hanachos, mugah, hagahos)      item = maamar id
 *                    maamor_jem_audio                               audio refs to the same JEM objects
 *   yomanim          yomanim (one Drive file each)                  item = the Drive file id
 *   hadranim         hadranim_links                                 item = hadran id
 *   michtavimKlolim  michtavim_links (one per language/edition)     item = letter id
 *   reshimos         the pre-Nesius entries' רשימות links           item = occasion id
 *
 * Links that are not Drive files (kitzur pages, ashreinu players) are not
 * objects and are only counted.
 */

export interface CollectionInventory {
  pdfs: number;
  audio: number;
  nonDrive: number;
}

export type CollectionsInventory = Partial<Record<CollectionId, CollectionInventory>>;

interface Context {
  maf: DatabaseSync;
  upsert: StatementSync;
  seenAt: string;
  collections: CollectionsInventory;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(name);
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((c) => c.name === column);
}

function tally(ctx: Context, collection: CollectionId): CollectionInventory {
  return (ctx.collections[collection] ??= { pdfs: 0, audio: 0, nonDrive: 0 });
}

function drivePdf(
  ctx: Context,
  collection: CollectionId,
  item: { itemId: string; role: string; url: string; label: string | null; ord: number | null; hebrewYear: number | null; hebrewDate: string | null },
): void {
  const counts = tally(ctx, collection);
  const fileId = extractDriveFileId(item.url);
  if (!fileId) {
    counts.nonDrive += 1;
    return;
  }
  ctx.upsert.run(
    collection,
    item.itemId,
    'pdf',
    fileId,
    item.role,
    'drive',
    item.url,
    extractDriveResourceKey(item.url),
    item.label,
    item.ord,
    null,
    item.hebrewYear,
    item.hebrewDate,
    ctx.seenAt,
  );
  counts.pdfs += 1;
}

function readLikkuteiSichos(ctx: Context): void {
  const rows = ctx.maf.prepare('SELECT l.sicha_id, l.role, l.label, l.url, s.ord FROM ls_links l JOIN ls_sichos s ON s.id = l.sicha_id ORDER BY s.volume, s.ord, l.rowid').all() as Array<{
    sicha_id: string;
    role: string;
    label: string;
    url: string;
    ord: number;
  }>;
  for (const row of rows) drivePdf(ctx, 'likkuteiSichos', { itemId: row.sicha_id, role: row.role, url: row.url, label: row.label, ord: row.ord, hebrewYear: null, hebrewDate: null });
}

function readMaamorim(ctx: Context, jemFilename: (url: string) => string): void {
  const links = ctx.maf
    .prepare(
      `SELECT l.maamor_id, l.section, l.label, l.url, m.hebrew_year, m.hebrew_date
       FROM maamorim_links l JOIN maamorim m ON m.id = l.maamor_id
       WHERE l.section NOT IN ('audio', 'video') ORDER BY l.maamor_id, l.rowid`,
    )
    .all() as Array<{ maamor_id: number; section: string; label: string; url: string; hebrew_year: number | null; hebrew_date: string | null }>;
  for (const row of links) {
    drivePdf(ctx, 'maamorim', { itemId: String(row.maamor_id), role: row.section, url: row.url, label: row.label, ord: null, hebrewYear: row.hebrew_year, hebrewDate: row.hebrew_date });
  }
  if (!hasTable(ctx.maf, 'maamor_jem_audio')) return;
  const audio = ctx.maf
    .prepare(
      `SELECT j.maamor_id, j.chapter_index, j.chapter_name, j.duration_ms, j.url, m.hebrew_year, m.hebrew_date
       FROM maamor_jem_audio j JOIN maamorim m ON m.id = j.maamor_id ORDER BY j.maamor_id, j.chapter_index`,
    )
    .all() as Array<{ maamor_id: number; chapter_index: number; chapter_name: string | null; duration_ms: number | null; url: string; hebrew_year: number | null; hebrew_date: string | null }>;
  const counts = tally(ctx, 'maamorim');
  for (const row of audio) {
    ctx.upsert.run(
      'maamorim',
      String(row.maamor_id),
      'audio',
      jemFilename(row.url),
      String(row.chapter_index),
      'jem',
      row.url,
      null,
      row.chapter_name,
      row.chapter_index,
      row.duration_ms,
      row.hebrew_year,
      row.hebrew_date,
      ctx.seenAt,
    );
    counts.audio += 1;
  }
}

function readYomanim(ctx: Context): void {
  const rows = ctx.maf.prepare('SELECT url, hebrew_year, month_token, ord, label FROM yomanim ORDER BY hebrew_year, month_token, ord').all() as Array<{
    url: string;
    hebrew_year: number;
    month_token: string;
    ord: number;
    label: string;
  }>;
  for (const row of rows) {
    drivePdf(ctx, 'yomanim', { itemId: extractDriveFileId(row.url) ?? row.url, role: '', url: row.url, label: row.label, ord: row.ord, hebrewYear: row.hebrew_year, hebrewDate: null });
  }
}

function readHadranim(ctx: Context): void {
  const rows = ctx.maf.prepare('SELECT hadran_id, section, label, url FROM hadranim_links ORDER BY hadran_id, rowid').all() as Array<{ hadran_id: number; section: string; label: string; url: string }>;
  for (const row of rows) drivePdf(ctx, 'hadranim', { itemId: String(row.hadran_id), role: row.section, url: row.url, label: row.label, ord: null, hebrewYear: null, hebrewDate: null });
}

function readMichtavim(ctx: Context): void {
  const rows = ctx.maf
    .prepare('SELECT l.michtav_id, l.language, l.edition, l.label, l.url, m.hebrew_year FROM michtavim_links l JOIN michtavim m ON m.id = l.michtav_id ORDER BY l.michtav_id, l.rowid')
    .all() as Array<{ michtav_id: number; language: string; edition: string; label: string; url: string; hebrew_year: number | null }>;
  for (const row of rows) {
    drivePdf(ctx, 'michtavimKlolim', {
      itemId: String(row.michtav_id),
      role: `${row.language}:${row.edition}`,
      url: row.url,
      label: row.label,
      ord: null,
      hebrewYear: row.hebrew_year,
      hebrewDate: null,
    });
  }
}

/** The pre-Nesius entries' רשימות: mafteiach files them under the occasion's mugah links (see mafteiach-index's README). */
function readReshimos(ctx: Context): void {
  const rows = ctx.maf
    .prepare(
      `SELECT l.occasion_id, l.label, l.url, o.hebrew_year, o.hebrew_date
       FROM links l JOIN occasions o ON o.id = l.occasion_id
       WHERE o.is_pre_nesius = 1 AND l.section = 'mugah' ORDER BY o.hebrew_date, l.occasion_id, l.rowid`,
    )
    .all() as Array<{ occasion_id: number; label: string; url: string; hebrew_year: number; hebrew_date: string }>;
  for (const row of rows) {
    drivePdf(ctx, 'reshimos', { itemId: String(row.occasion_id), role: 'reshimos', url: row.url, label: row.label, ord: null, hebrewYear: row.hebrew_year, hebrewDate: row.hebrew_date });
  }
}

/** Upserts `wanted` rows for every section collection present in `maf`. Runs inside the caller's transaction. */
export function loadSectionsInventory(maf: DatabaseSync, upsert: StatementSync, seenAt: string, jemFilename: (url: string) => string): CollectionsInventory {
  const ctx: Context = { maf, upsert, seenAt, collections: {} };
  if (hasTable(maf, 'ls_links')) readLikkuteiSichos(ctx);
  if (hasTable(maf, 'maamorim_links')) readMaamorim(ctx, jemFilename);
  if (hasTable(maf, 'yomanim')) readYomanim(ctx);
  if (hasTable(maf, 'hadranim_links')) readHadranim(ctx);
  if (hasTable(maf, 'michtavim_links')) readMichtavim(ctx);
  if (hasColumn(maf, 'occasions', 'is_pre_nesius')) readReshimos(ctx);
  return ctx.collections;
}
