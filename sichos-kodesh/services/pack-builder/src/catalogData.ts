import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CatalogEntry } from '@sichos-kodesh/catalog';

/**
 * The farbrengens a pack is built from come from the same year files both
 * apps bundle (`apps/<app>/src/catalog/data/<year>.json`), so a pack's entries
 * are the apps' own occasion ids, labels and file ids.
 */
export async function loadYearEntries(dataDir: string, year: number): Promise<CatalogEntry[]> {
  const file = path.join(dataDir, `${year}.json`);
  const value = JSON.parse(await readFile(file, 'utf8')) as unknown;
  if (!Array.isArray(value)) throw new Error(`${file} is not a catalog year file`);
  for (const entry of value) {
    const e = entry as Partial<CatalogEntry>;
    if (typeof e.occasionId !== 'number' || e.hebrewYear !== year || typeof e.hebrewDate !== 'string' || !Array.isArray(e.audio) || !Array.isArray(e.pdfs)) {
      throw new Error(`${file} has an entry that is not a catalog entry of ${year}`);
    }
  }
  return value as CatalogEntry[];
}
