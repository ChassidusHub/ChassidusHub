#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY_COLLECTION_IDS, type CatalogLibrary } from '../src/library/types.js';
import { translateLibrary } from '../src/translate/library.js';
import { addLibraryViews } from '../src/library/views.js';
import { loadLibraryEditions, loadLibraryTranslations } from './libraryTranslations.js';

/**
 * Adds to a built library in place what the crawl doesn't give it - the
 * other language's names (src/translate/library.ts) and the browse views
 * derived from it (src/library/views.ts: by month, moed and parsha, and
 * ספר המאמרים מלוקט by the months) - on the library the apps bundle,
 * without the crawl databases a full `build-catalog` needs.
 * `build-catalog` does the same as it writes the library, so a rebuild
 * keeps them.
 *
 *   npm run enrich-library -w @sichos-kodesh/catalog
 *
 *   --library <dir>   the library's files (default: apps/mobile/src/catalog/data/library;
 *                     the web reads the same files)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const dir = path.resolve(arg('library', path.join(__dirname, '..', '..', '..', 'apps', 'mobile', 'src', 'catalog', 'data', 'library')));
const meta = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8')) as Pick<CatalogLibrary, 'moadim' | 'parshiyos'>;
const collections = Object.fromEntries(
  await Promise.all(LIBRARY_COLLECTION_IDS.map(async (id) => [id, JSON.parse(await readFile(path.join(dir, `${id}.json`), 'utf8'))] as const)),
) as unknown as CatalogLibrary['collections'];

const translated = addLibraryViews(translateLibrary({ ...meta, collections }, await loadLibraryTranslations()), await loadLibraryEditions());
for (const id of LIBRARY_COLLECTION_IDS) {
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(translated.collections[id]), 'utf8');
}

// What is still in one language only, to extend the rules or the tables with.
const count = (items: object[], key: string) => items.filter((item) => key in item).length;
const c = translated.collections;
const refs = c.jemEvents.items.flatMap((item) => item.refs.filter((ref) => ref.label));
console.log(`Recordings: ${count(c.jemEvents.items, 'labelHe')}/${c.jemEvents.items.length} names, ${refs.filter((ref) => ref.labelHe).length}/${refs.length} chapter names in Hebrew`);
console.log(`Maamorim: ${count(c.maamorim.items, 'occasionLabelEn')}/${c.maamorim.items.length} occasions in English`);
console.log(`Likkutei Sichos: ${count(c.likkuteiSichos.items, 'sectionLabelEn')}/${c.likkuteiSichos.items.length} sections in English`);
for (const id of ['reshimos', 'michtavimKlolim', 'hadranim'] as const) console.log(`${id}: ${count(c[id].items, 'labelEn')}/${c[id].items.length} names in English`);
for (const id of ['maamorim', 'reshimos', 'jemEvents'] as const) {
  const groups = translated.collections[id].groups;
  console.log(`${id} views: ${Object.entries(groups).map(([axis, list]) => `${axis} ${list.length}`).join(', ')}`);
}
