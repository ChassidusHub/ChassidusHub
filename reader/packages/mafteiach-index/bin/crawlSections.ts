#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db.js';
import { PoliteFetcher } from '../src/httpClient.js';
import { SECTION_IDS } from '../src/sections/context.js';
import { crawlSections, isSectionId } from '../src/sections/crawlSections.js';
import { DEFAULT_USER_AGENT } from '../src/userAgent.js';

/**
 * Crawls, and on every later run syncs, every mafteiach section beyond the
 * dated farbrengens into mafteiach.db (see src/sections/). Run `npm run sync`
 * first so the occasions the moadim, parshiyos and maamorim point at exist.
 *
 *   --sections a,b     some of: likkuteiSichos, maamorim, yomanim, hadranim, michtavim, moadim, parshiyos (default all)
 *   --db <path>        default ../mafteiach.db
 *   --cache <dir>      default ../.cache (responses are kept under etag/)
 *   --delay-ms <n>     pause after every request, default 750
 *   --limit <n>        a pilot: at most n pages per loop
 *   --no-revalidate    re-parse everything fetched before from the cache, without a request
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const dbPath = arg('db', path.join(__dirname, '..', 'mafteiach.db'));
const cacheDir = arg('cache', path.join(__dirname, '..', '.cache'));
const delayMs = Number(arg('delay-ms', '750'));
const limitArg = arg('limit', '');
const limit = limitArg ? Number(limitArg) : undefined;
const revalidate = !process.argv.includes('--no-revalidate');
const requested = arg('sections', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const unknown = requested.filter((s) => !isSectionId(s));
if (unknown.length > 0) {
  console.error(`Unknown section(s): ${unknown.join(', ')}. Known: ${SECTION_IDS.join(', ')}`);
  process.exit(1);
}
const sections = requested.length > 0 ? requested.filter(isSectionId) : [...SECTION_IDS];

console.log(`Crawling ${sections.join(', ')} into ${dbPath}${limit ? ` (limit ${limit} per loop)` : ''}${revalidate ? '' : ' from the cache only'}...`);

const db = openDatabase(dbPath);
const fetcher = new PoliteFetcher({ cacheDir, userAgent: DEFAULT_USER_AGENT, delayMs });
const results = await crawlSections({
  db,
  fetcher,
  sections,
  limit,
  revalidate,
  onProgress: ({ section, phase, index, total }) => {
    process.stdout.write(`\r[${section} ${phase}] ${index}/${total}          `);
  },
});

console.log('\n');
for (const r of results) {
  console.log(`${r.section}: ${r.pages} page(s) read, ${r.changedPages} new or changed; ${r.checked} checked - ${r.inserted} inserted, ${r.updated} updated, ${r.unchanged} unchanged`);
  if (r.newIds.length > 0 && r.newIds.length !== r.inserted) console.log(`  new: ${r.newIds.length}`);
  if (r.missingIds.length > 0) console.log(`  ⚠ no longer listed (kept, not deleted): ${r.missingIds.slice(0, 20).join(', ')}${r.missingIds.length > 20 ? ` … (${r.missingIds.length})` : ''}`);
  for (const warning of r.warnings) console.log(`  ⚠ ${warning}`);
}
