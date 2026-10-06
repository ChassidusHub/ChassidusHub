import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ArchiveStore } from '@chassidushub-reader/archive';
import type { CatalogWork, CatalogWorkContents } from '@chassidushub-reader/catalog';
import type { PackKeyPair, PackManifest } from '@chassidushub-reader/pack-format';
import {
  MANIFEST_ENTRY_NAME,
  SEARCH_INDEX_FORMAT,
  SEARCH_INDEX_SQL,
  canonicalBytes,
  composeManifests,
  normalizeSearchText,
  PACK_EXTENSION,
  objectEntryName,
  searchIndexEntry,
  signManifest,
  splitEntries,
  textObjectWords,
  workPackScope,
  workTextEntries,
} from '@chassidushub-reader/pack-format';
import type { BuiltPack } from './build.js';
import { writeStoredZip, type ZipSource } from './zip.js';

/**
 * A work's text pack (catalog schema 3):
 * - every text of the work that may ship, read from the archive by the
 *   sha256 the catalog names;
 * - the work's search index, an SQLite FTS4 database built from those same
 *   texts, so the phone can search a downloaded sefer offline.
 *
 * The rights were decided when the texts were imported, and the catalog
 * build checked them again. The entries here take only editions whose
 * source may ship (workTextEntries), as a third check.
 */

export interface WorkPackOptions {
  work: CatalogWork;
  contents: CatalogWorkContents;
  catalogVersion: string;
  outDir: string;
  /** Null builds an unsigned pack. */
  key: PackKeyPair | null;
  /** A part holds at most this many bytes (the search index goes in the first part). */
  maxBytes: number;
  /** Build even when some texts are not in the archive yet (they are left out of the pack and the index). */
  allowMissing: boolean;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface WorkPackResult {
  packs: BuiltPack[];
  texts: number;
  textBytes: number;
  /** The shas the catalog names and the archive lacks. */
  missing: string[];
  search: { sha256: string; bytes: number; rows: number };
}

/** `work-tanya.skpack`, or `work-tanya.part1of2.skpack` when split: a text pack has no audio profile to name. */
export function workPackFileName(workId: string, part?: { index: number; count: number }): string {
  return `work-${workId}${part && part.count > 1 ? `.part${part.index + 1}of${part.count}` : ''}${PACK_EXTENSION}`;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The search database for a work's texts, written to `file`. One row per
 * unit and edition, in the order given, so the same texts always make the
 * same file.
 */
export function writeSearchIndex(file: string, meta: { workId: string; catalogVersion: string }, rows: ReadonlyArray<{ unitId: string; source: number; title: string; html: string }>): number {
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode = DELETE');
    db.exec('PRAGMA page_size = 4096');
    for (const statement of SEARCH_INDEX_SQL) db.exec(statement);
    const putMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    putMeta.run('format', String(SEARCH_INDEX_FORMAT));
    putMeta.run('work', meta.workId);
    putMeta.run('catalog', meta.catalogVersion);
    const putRow = db.prepare('INSERT INTO rows (id, unit, source) VALUES (?, ?, ?)');
    const putText = db.prepare('INSERT INTO search (docid, title, body) VALUES (?, ?, ?)');
    db.exec('BEGIN');
    for (const [index, row] of rows.entries()) {
      // A BigInt binds as an integer: FTS4 refuses a docid that arrives as a float.
      const id = BigInt(index + 1);
      putRow.run(id, row.unitId, row.source);
      putText.run(id, normalizeSearchText(row.title), textObjectWords(row.html));
    }
    db.exec('COMMIT');
    db.exec("INSERT INTO search(search) VALUES ('optimize')");
    db.exec('VACUUM');
  } finally {
    db.close();
  }
  return rows.length;
}

export async function buildWorkPack(store: ArchiveStore, options: WorkPackOptions): Promise<WorkPackResult> {
  const log = options.log ?? (() => undefined);
  const now = options.now ?? (() => new Date());
  const { work, contents } = options;

  // The texts, from the archive, by the sha256 the catalog names.
  const wanted = workTextEntries(work, contents);
  const paths = new Map<string, string>();
  const missing: string[] = [];
  for (const entry of wanted) {
    for (const ref of entry.refs) {
      const file = store.pathOf(ref.sha256);
      if (file && (await exists(file))) paths.set(ref.sha256, file);
      else missing.push(ref.sha256);
    }
  }
  if (missing.length > 0) {
    const line = `${missing.length} text(s) of ${work.id} are not in the archive (run sk-archive import-text --collection works)`;
    if (!options.allowMissing) throw new Error(line);
    log(`warning: ${line}`);
  }
  const entries = wanted.map((entry) => ({ ...entry, refs: entry.refs.filter((ref) => paths.has(ref.sha256)) })).filter((entry) => entry.refs.length > 0);
  if (entries.length === 0) throw new Error(`${work.id} has no text the archive holds and the rights let ship`);

  // The search index, from the same texts.
  const units = new Map(contents.units.map((unit) => [unit.id, unit]));
  const rows: Array<{ unitId: string; source: number; title: string; html: string }> = [];
  for (const entry of entries) {
    const unitId = entry.itemId.slice(work.id.length + 1);
    const unit = units.get(unitId)!;
    for (const ref of entry.refs) {
      const source = Number(ref.role);
      const language = work.sources[source]?.language;
      rows.push({ unitId, source, title: language === 'en' ? (unit.labelEn ?? unit.label) : unit.label, html: await readFile(paths.get(ref.sha256)!, 'utf8') });
    }
  }
  await mkdir(options.outDir, { recursive: true });
  const indexFile = path.join(options.outDir, `.${work.id}.search.sqlite`);
  await rm(indexFile, { force: true });
  writeSearchIndex(indexFile, { workId: work.id, catalogVersion: options.catalogVersion }, rows);
  const indexBytes = await readFile(indexFile);
  const search = { sha256: sha256Hex(indexBytes), bytes: indexBytes.byteLength, rows: rows.length };
  paths.set(search.sha256, indexFile);

  const parts = splitEntries([searchIndexEntry(work, search.sha256, search.bytes), ...entries], options.maxBytes);
  const manifests = await composeManifests({ scope: workPackScope(work), profile: 'src', catalogVersion: options.catalogVersion, builtAt: now().toISOString(), parts, hash: sha256Hex });

  const packs: BuiltPack[] = [];
  try {
    for (const [i, unsigned] of manifests.entries()) {
      const part = parts[i]!;
      const manifest: PackManifest = options.key ? signManifest(unsigned, options.key) : unsigned;
      const sources: ZipSource[] = [{ name: MANIFEST_ENTRY_NAME, data: canonicalBytes(manifest) }];
      for (const [sha, bytes] of Object.entries(part.objects)) sources.push({ name: objectEntryName(sha), file: paths.get(sha)!, bytes });
      const name = workPackFileName(work.id, manifest.part);
      const file = path.join(options.outDir, name);
      const bytes = await writeStoredZip(file, sources);
      log(`${name}: ${part.entries.length} entr${part.entries.length === 1 ? 'y' : 'ies'}, ${Object.keys(part.objects).length} object(s), ${bytes} bytes`);
      packs.push({ file, bytes, manifest });
    }
  } finally {
    await rm(indexFile, { force: true });
  }
  const texts = new Map(entries.flatMap((entry) => entry.refs.map((ref) => [ref.sha256, ref.bytes] as const)));
  const textBytes = [...texts.values()].reduce((sum, bytes) => sum + bytes, 0);
  return { packs, texts: texts.size, textBytes, missing, search };
}
