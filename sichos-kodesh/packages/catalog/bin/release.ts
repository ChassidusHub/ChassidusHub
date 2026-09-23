#!/usr/bin/env node
/**
 * Writes the two files a catalog release consists of - what api.sk.shmuky.dev
 * serves and the apps fetch (see src/release.ts for their shape):
 *
 *   <out>/catalog.json    the data itself (every year the apps bundle), self-describing
 *   <out>/manifest.json   version, size, SHA-256, years, changelog, and the catalog's URL
 *
 * Reads the per-year JSON the apps bundle (apps/web/src/catalog/data by
 * default - both apps carry an identical copy) so a release is exactly what
 * the apps of that commit ship, and stamps it with CATALOG_VERSION and the
 * changelog. Run through `npm run release-files -w @sichos-kodesh/catalog`
 * - see README.md's "Catalog releases" for the whole release routine.
 *
 *   --data <dir>          where the year files are (default: apps/web/src/catalog/data)
 *   --out <dir>           where to write (default: packages/catalog/dist-release)
 *   --base-url <url>      the API origin the manifest's `url` points into (default: https://api.sk.shmuky.dev)
 *   --released-at <iso>   the release timestamp to stamp (default: now) - services/catalog-api passes the
 *                         deployed commit's date, so the same commit always yields the same manifest
 *   --check               fail unless CATALOG_CHANGELOG's first entry is for CATALOG_VERSION (what CI runs on a tag)
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_CHANGELOG } from '../src/changelog.js';
import { CATALOG_SCHEMA_VERSION, CATALOG_VERSION } from '../src/version.js';
import { catalogReleasePath, catalogReleaseTag } from '../src/release.js';
import type { CatalogManifest, CatalogRelease } from '../src/release.js';
import type { CatalogByYear } from '../src/catalogLookup.js';
import type { CatalogEntry } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const dataDir = arg('data', path.join(repoRoot, 'apps', 'web', 'src', 'catalog', 'data'));
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
for (const name of yearFiles) {
  const entries = JSON.parse(await readFile(path.join(dataDir, name), 'utf8')) as CatalogEntry[];
  byYear[Number(name.slice(0, 4))] = entries;
  occasions += entries.length;
}

const releasedAtArg = arg('released-at', '');
const releasedAt = releasedAtArg && !Number.isNaN(Date.parse(releasedAtArg)) ? new Date(releasedAtArg).toISOString() : new Date().toISOString();
const release: CatalogRelease = { schemaVersion: CATALOG_SCHEMA_VERSION, version: CATALOG_VERSION, releasedAt, byYear };
const catalogJson = JSON.stringify(release);
const catalogBytes = Buffer.from(catalogJson, 'utf8');

const manifest: CatalogManifest = {
  schemaVersion: CATALOG_SCHEMA_VERSION,
  version: CATALOG_VERSION,
  releasedAt,
  url: `${baseUrl}${catalogReleasePath(CATALOG_VERSION)}`,
  bytes: catalogBytes.byteLength,
  sha256: createHash('sha256').update(catalogBytes).digest('hex'),
  years: Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b),
  occasions,
  changelog: CATALOG_CHANGELOG,
};

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'catalog.json'), catalogBytes);
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`Catalog ${CATALOG_VERSION}: ${manifest.years.length} years, ${occasions} occasions, ${(manifest.bytes / 1024 / 1024).toFixed(2)} MB, sha256 ${manifest.sha256.slice(0, 12)}…`);
console.log(`Wrote ${path.join(outDir, 'catalog.json')} and manifest.json (url: ${manifest.url})`);
console.log(`Tag it with: git tag ${catalogReleaseTag(CATALOG_VERSION)} && git push origin ${catalogReleaseTag(CATALOG_VERSION)}`);
