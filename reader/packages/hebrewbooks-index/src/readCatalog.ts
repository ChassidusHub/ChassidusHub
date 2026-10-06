import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';
import type { HebrewBooksRow } from './types.js';

/**
 * Reads Otzaria's HebrewBooks catalog: `otzar-HB_catalog.db.zst` from the
 * latest release of github.com/Otzaria/otzar-HB_catalog, or the SQLite file
 * inside it. Only the `hebrew_books` table and the catalog's version are
 * read; the Otzar HaChochma table and Otzaria's own text mapping are not.
 */

export interface HebrewBooksCatalog {
  version: string;
  rows: HebrewBooksRow[];
}

function tags(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null);

export function readCatalogDatabase(file: string): HebrewBooksCatalog {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const meta = db.prepare("SELECT value FROM db_meta WHERE key = 'version'").get() as { value?: string } | undefined;
    const rows = db.prepare('SELECT id_book, title, author, printing_place, printing_year, pages, tags FROM hebrew_books ORDER BY id_book').all() as Array<Record<string, unknown>>;
    return {
      version: meta?.value ?? 'unknown',
      rows: rows
        .filter((row) => typeof row.id_book === 'number' && text(row.title))
        .map((row) => ({
          id: row.id_book as number,
          title: text(row.title)!,
          author: text(row.author),
          printingPlace: text(row.printing_place),
          printingYear: text(row.printing_year),
          pages: typeof row.pages === 'number' && row.pages > 0 ? row.pages : null,
          tags: tags(row.tags),
        })),
    };
  } finally {
    db.close();
  }
}

/** The catalog from a `.db.zst` (decompressed to a temporary file first) or a plain `.db`. */
export function readCatalog(file: string): HebrewBooksCatalog {
  if (!file.endsWith('.zst')) return readCatalogDatabase(file);
  const dir = mkdtempSync(join(tmpdir(), 'hebrewbooks-'));
  try {
    const db = join(dir, 'catalog.db');
    writeFileSync(db, zstdDecompressSync(readFileSync(file)));
    return readCatalogDatabase(db);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
