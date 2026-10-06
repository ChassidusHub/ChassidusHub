#!/usr/bin/env node
/**
 * Writes the files a catalog release consists of - what api.sk.shmuky.dev
 * serves and the apps fetch (see src/release.ts for their shape):
 *
 *   <out>/catalog.json          schema 1: the farbrengens (every year the apps bundle) - the web app
 *   <out>/manifest.json         its version, size, SHA-256, years, changelog and URL
 *   <out>/v2/catalog.json       schema 2: the same farbrengens plus the library - the phone app
 *   <out>/v2/manifest.json
 *   <out>/v3/catalog.json       schema 3: schema 2 plus the works (the Rebbeim's seforim) - the phone app from mobile 1.5.0
 *   <out>/v3/manifest.json
 *   <out>/parts/byYear.json     the farbrengens', the library's and the works' JSON, as they sit inside
 *   <out>/parts/library.json    the catalog.json files - services/catalog-api keeps one copy of each
 *   <out>/parts/works.json
 *
 * Reads the per-year JSON the apps bundle (apps/web/src/catalog/data by
 * default; apps/mobile carries an identical copy, checked here) and the
 * library the phone bundles (apps/mobile/src/catalog/data/library), so a
 * release is exactly what the apps of that commit ship, stamped with
 * CATALOG_VERSION and the changelog. Run through
 * `npm run release-files -w @sichos-kodesh/catalog` - see README.md's
 * "Catalog releases" for the whole release routine.
 *
 *   --data <dir>          where the year files are (default: apps/web/src/catalog/data)
 *   --mobile-data <dir>   the phone's copy, which must be identical (default: apps/mobile/src/catalog/data)
 *   --library <dir>       the library files (default: apps/mobile/src/catalog/data/library); no library, no v2
 *   --works <dir>         the works files (default: apps/mobile/src/catalog/data/works); no works, no v3
 *   --out <dir>           where to write (default: packages/catalog/dist-release)
 *   --base-url <url>      the API origin the manifests' `url` points into (default: https://api.sk.shmuky.dev)
 *   --released-at <iso>   the release timestamp to stamp (default: now) - services/catalog-api passes the
 *                         deployed commit's date, so the same commit always yields the same manifests
 *   --check               fail unless CATALOG_CHANGELOG's first entry is for CATALOG_VERSION (what CI runs on a tag)
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_CHANGELOG } from '../src/changelog.js';
import { libraryCounts } from '../src/library/lookup.js';
import { parseCatalogLibrary } from '../src/library/parse.js';
import { LIBRARY_COLLECTION_IDS } from '../src/library/types.js';
import { assertShippable, GATED_COLLECTION_IDS } from '../src/rights.js';
import { CATALOG_LIBRARY_SCHEMA_VERSION, CATALOG_SCHEMA_VERSION, CATALOG_VERSION, CATALOG_WORKS_SCHEMA_VERSION } from '../src/version.js';
import { catalogReleasePath, catalogReleaseTag, serializeCatalogRelease, serializeLibraryRelease, serializeWorksRelease } from '../src/release.js';
import { parseCatalogWorks, worksRightsProblems } from '../src/works/parse.js';
import type { CatalogManifest } from '../src/release.js';
import type { CatalogByYear } from '../src/catalogLookup.js';
import type { CatalogEntry } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const dataDir = arg('data', path.join(repoRoot, 'apps', 'web', 'src', 'catalog', 'data'));
const mobileDataDir = arg('mobile-data', path.join(repoRoot, 'apps', 'mobile', 'src', 'catalog', 'data'));
const libraryDir = arg('library', path.join(repoRoot, 'apps', 'mobile', 'src', 'catalog', 'data', 'library'));
const worksDir = arg('works', path.join(repoRoot, 'apps', 'mobile', 'src', 'catalog', 'data', 'works'));
const outDir = arg('out', path.join(__dirname, '..', 'dist-release'));
const baseUrl = arg('base-url', 'https://api.sk.shmuky.dev').replace(/\/$/, '');
const checkOnly = process.argv.includes('--check');

const latest = CATALOG_CHANGELOG[0];
if (!latest || latest.version !== CATALOG_VERSION) {
  console.error(`CATALOG_CHANGELOG's first entry must be for CATALOG_VERSION (${CATALOG_VERSION}); found ${latest?.version ?? 'none'}.`);
  process.exit(1);
}
if (checkOnly) {
  console.log(`Catalog ${CATALOG_VERSION} (${catalogReleaseTag(CATALOG_VERSION)}) has a matching changelog entry.`);
  process.exit(0);
}

const yearFiles = (await readdir(dataDir)).filter((name) => /^\d{4}\.json$/.test(name)).sort();
if (yearFiles.length === 0) {
  console.error(`No <year>.json files found in ${dataDir}`);
  process.exit(1);
}

const byYear: CatalogByYear = {};
let occasions = 0;
const mismatched: string[] = [];
for (const name of yearFiles) {
  const raw = await readFile(path.join(dataDir, name), 'utf8');
  const entries = JSON.parse(raw) as CatalogEntry[];
  byYear[Number(name.slice(0, 4))] = entries;
  occasions += entries.length;
  if (existsSync(mobileDataDir)) {
    const mobile = await readFile(path.join(mobileDataDir, name), 'utf8').catch(() => null);
    if (mobile !== raw) mismatched.push(name);
  }
}
if (mismatched.length > 0) {
  console.error(`apps/web and apps/mobile must bundle the same year files; these differ: ${mismatched.join(', ')}`);
  process.exit(1);
}

const releasedAtArg = arg('released-at', '');
const releasedAt = releasedAtArg && !Number.isNaN(Date.parse(releasedAtArg)) ? new Date(releasedAtArg).toISOString() : new Date().toISOString();
const years = Object.keys(byYear)
  .map(Number)
  .sort((a, b) => a - b);
const byYearJson = JSON.stringify(byYear);

function manifestFor(schemaVersion: number, bytes: Buffer, extra: Partial<CatalogManifest> = {}): CatalogManifest {
  return {
    schemaVersion,
    version: CATALOG_VERSION,
    releasedAt,
    url: `${baseUrl}${catalogReleasePath(CATALOG_VERSION, schemaVersion)}`,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    years,
    occasions,
    changelog: CATALOG_CHANGELOG,
    ...extra,
  };
}

// Schema 1 - byte for byte what JSON.stringify({ schemaVersion, version, releasedAt, byYear }) gives.
const catalogBytes = Buffer.from(serializeCatalogRelease({ schemaVersion: CATALOG_SCHEMA_VERSION, version: CATALOG_VERSION, releasedAt }, byYearJson), 'utf8');
const manifest = manifestFor(CATALOG_SCHEMA_VERSION, catalogBytes);
await mkdir(path.join(outDir, 'parts'), { recursive: true });
await writeFile(path.join(outDir, 'catalog.json'), catalogBytes);
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
await writeFile(path.join(outDir, 'parts', 'byYear.json'), byYearJson, 'utf8');
console.log(`Catalog ${CATALOG_VERSION}: ${years.length} years, ${occasions} occasions, ${(manifest.bytes / 1024 / 1024).toFixed(2)} MB, sha256 ${manifest.sha256.slice(0, 12)}…`);

// Schema 2 - the same farbrengens plus the library the phone bundles.
if (existsSync(path.join(libraryDir, 'meta.json'))) {
  // The Igros and Maanos are gated (src/rights.ts): a library folder that
  // holds them is refused outright, as is any collection not cleared to ship.
  assertShippable(
    GATED_COLLECTION_IDS.filter((id) => existsSync(path.join(libraryDir, `${id}.json`))),
    libraryDir,
  );
  assertShippable(LIBRARY_COLLECTION_IDS, 'the release');
  const meta = JSON.parse(await readFile(path.join(libraryDir, 'meta.json'), 'utf8')) as Record<string, unknown>;
  const collections: Record<string, unknown> = {};
  for (const id of LIBRARY_COLLECTION_IDS) collections[id] = JSON.parse(await readFile(path.join(libraryDir, `${id}.json`), 'utf8'));
  const library = parseCatalogLibrary({ moadim: meta.moadim, parshiyos: meta.parshiyos, collections });
  if (!library) {
    console.error(`The library in ${libraryDir} does not validate (parseCatalogLibrary); rebuild it with build-catalog.`);
    process.exit(1);
  }
  const libraryJson = JSON.stringify(library);
  const libraryBytes = Buffer.from(serializeLibraryRelease({ schemaVersion: CATALOG_LIBRARY_SCHEMA_VERSION, version: CATALOG_VERSION, releasedAt }, byYearJson, libraryJson), 'utf8');
  const libraryManifest = manifestFor(CATALOG_LIBRARY_SCHEMA_VERSION, libraryBytes, { collections: libraryCounts(library) });
  await mkdir(path.join(outDir, 'v2'), { recursive: true });
  await writeFile(path.join(outDir, 'v2', 'catalog.json'), libraryBytes);
  await writeFile(path.join(outDir, 'v2', 'manifest.json'), JSON.stringify(libraryManifest, null, 2) + '\n', 'utf8');
  await writeFile(path.join(outDir, 'parts', 'library.json'), libraryJson, 'utf8');
  const counts = Object.entries(libraryManifest.collections ?? {})
    .map(([id, n]) => `${id} ${n}`)
    .join(', ');
  console.log(`Catalog ${CATALOG_VERSION} with the library (schema 2): ${counts}; ${(libraryManifest.bytes / 1024 / 1024).toFixed(2)} MB, sha256 ${libraryManifest.sha256.slice(0, 12)}…`);

  // Schema 3 - schema 2 plus the works the phone bundles.
  if (existsSync(path.join(worksDir, 'works.json'))) {
    const index = JSON.parse(await readFile(path.join(worksDir, 'works.json'), 'utf8')) as Record<string, unknown>;
    const contents: Record<string, unknown> = {};
    const contentsDir = path.join(worksDir, 'contents');
    for (const name of existsSync(contentsDir) ? (await readdir(contentsDir)).filter((n) => n.endsWith('.json')).sort() : []) {
      contents[name.slice(0, -'.json'.length)] = JSON.parse(await readFile(path.join(contentsDir, name), 'utf8'));
    }
    // The HebrewBooks shelf rides in the works when the build has one (catalog 1.5.0 on).
    const shelfFile = path.join(worksDir, 'shelf.json');
    const shelf = existsSync(shelfFile) ? (JSON.parse(await readFile(shelfFile, 'utf8')) as unknown) : undefined;
    const works = parseCatalogWorks(shelf === undefined ? { authors: index.authors, works: index.works, contents } : { authors: index.authors, works: index.works, contents, shelf });
    if (!works) {
      console.error(`The works in ${worksDir} do not validate (parseCatalogWorks); rebuild them with build-catalog-works.`);
      process.exit(1);
    }
    const problems = worksRightsProblems(works);
    if (problems.length > 0) {
      console.error(`The works in ${worksDir} carry text that may not ship:\n  ${problems.join('\n  ')}`);
      process.exit(1);
    }
    const worksJson = JSON.stringify(works);
    const worksBytes = Buffer.from(serializeWorksRelease({ schemaVersion: CATALOG_WORKS_SCHEMA_VERSION, version: CATALOG_VERSION, releasedAt }, byYearJson, libraryJson, worksJson), 'utf8');
    const units = Object.values(works.contents).reduce((sum, part) => sum + part.units.length, 0);
    const worksManifest = manifestFor(CATALOG_WORKS_SCHEMA_VERSION, worksBytes, { collections: libraryCounts(library), works: { works: works.works.length, units } });
    await mkdir(path.join(outDir, 'v3'), { recursive: true });
    await writeFile(path.join(outDir, 'v3', 'catalog.json'), worksBytes);
    await writeFile(path.join(outDir, 'v3', 'manifest.json'), JSON.stringify(worksManifest, null, 2) + '\n', 'utf8');
    await writeFile(path.join(outDir, 'parts', 'works.json'), worksJson, 'utf8');
    console.log(`Catalog ${CATALOG_VERSION} with the works (schema 3): ${works.works.length} works, ${units} units; ${(worksManifest.bytes / 1024 / 1024).toFixed(2)} MB, sha256 ${worksManifest.sha256.slice(0, 12)}…`);
  } else {
    console.log(`No works in ${worksDir} - wrote schemas 1 and 2 only.`);
  }
} else {
  console.log(`No library in ${libraryDir} - wrote schema 1 only.`);
}

console.log(`Wrote ${outDir} (url: ${manifest.url})`);
console.log(`Tag it with: git tag ${catalogReleaseTag(CATALOG_VERSION)} && git push origin ${catalogReleaseTag(CATALOG_VERSION)}`);
