#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY_COLLECTION_IDS, type CatalogLibrary } from '../src/library/types.js';
import { translateCatalogYear, translateLibrary } from '../src/translate/library.js';
import { shortenCatalogYear, shortenLibrary } from '../src/translate/shortTitles.js';
import { addLibraryViews } from '../src/library/views.js';
import type { CatalogEntry } from '../src/types.js';
import { loadLibraryEditions, loadLibraryTranslations, loadShortTitles } from './libraryTranslations.js';

/**
 * Adds to a built library in place what the crawl doesn't give it - the
 * other language's names (src/translate/library.ts), the short titles of
 * the long names (src/translate/shortTitles.ts) and the browse views
 * derived from it (src/library/views.ts: by month, moed and parsha, and
 * ספר המאמרים מלוקט by the months) - on the library the apps bundle, and
 * the short titles and the Hebrew chapter names on both apps' year files,
 * without the crawl databases a full `build-catalog` needs. `build-catalog` does the same as it writes
 * them, so a rebuild keeps them.
 *
 *   npm run enrich-library -w @chassidushub-reader/catalog
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

const shortTitles = await loadShortTitles();
const translations = await loadLibraryTranslations();
const translated = addLibraryViews(shortenLibrary(translateLibrary({ ...meta, collections }, translations), shortTitles), await loadLibraryEditions());
for (const id of LIBRARY_COLLECTION_IDS) {
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(translated.collections[id]), 'utf8');
}

// The farbrengens' year files, the same in both apps (bin/release.ts checks).
const apps = path.join(__dirname, '..', '..', '..', 'apps');
let shortened = 0;
for (const app of ['mobile', 'web']) {
  const dataDir = path.join(apps, app, 'src', 'catalog', 'data');
  for (const file of (await readdir(dataDir)).filter((name) => /^\d{4}\.json$/.test(name))) {
    const year = shortenCatalogYear(translateCatalogYear(JSON.parse(await readFile(path.join(dataDir, file), 'utf8')) as CatalogEntry[], translations), shortTitles);
    await writeFile(path.join(dataDir, file), JSON.stringify(year, null, 2), 'utf8');
    if (app === 'mobile') shortened += year.filter((entry) => entry.occasionLabelShort || entry.occasionLabelShortEn).length;
  }
}
console.log(`Farbrengens: ${shortened} with a short title`);

// What is still in one language only, to extend the rules or the tables with.
const count = (items: object[], key: string) => items.filter((item) => key in item).length;
const c = translated.collections;
const refs = c.jemEvents.items.flatMap((item) => item.refs.filter((ref) => ref.label));
console.log(`Recordings: ${count(c.jemEvents.items, 'labelHe')}/${c.jemEvents.items.length} names, ${refs.filter((ref) => ref.labelHe).length}/${refs.length} chapter names in Hebrew`);
const maamarAudio = c.maamorim.items.flatMap((item) => item.refs.filter((ref) => ref.kind === 'audio' && ref.label));
console.log(`Maamorim: ${maamarAudio.filter((ref) => ref.labelHe).length}/${maamarAudio.length} recordings' names in Hebrew`);
console.log(`Maamorim: ${count(c.maamorim.items, 'occasionLabelEn')}/${c.maamorim.items.length} occasions in English, ${count(c.maamorim.items, 'occasionLabelShort')} short titles`);
console.log(`Likkutei Sichos: ${count(c.likkuteiSichos.items, 'sectionLabelEn')}/${c.likkuteiSichos.items.length} sections in English`);
for (const id of ['reshimos', 'michtavimKlolim', 'hadranim'] as const) console.log(`${id}: ${count(c[id].items, 'labelEn')}/${c[id].items.length} names in English, ${count(c[id].items, 'labelShort')} short titles`);
for (const id of ['maamorim', 'reshimos', 'jemEvents'] as const) {
  const groups = translated.collections[id].groups;
  console.log(`${id} views: ${Object.entries(groups).map(([axis, list]) => `${axis} ${list.length}`).join(', ')}`);
}
