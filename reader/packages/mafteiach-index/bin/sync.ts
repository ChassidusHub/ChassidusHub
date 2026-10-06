#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db.js';
import { PoliteFetcher } from '../src/httpClient.js';
import { syncAll } from '../src/sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const dbPath = arg('db', path.join(__dirname, '..', 'mafteiach.db'));
const cacheDir = arg('cache', path.join(__dirname, '..', '.cache'));
const delayMs = Number(arg('delay-ms', '750'));

const USER_AGENT =
  'ChassidusHubAppResearch/0.1 (+https://github.com/ChassidusHub/ChassidusHub; building an offline kvius-scheduled farbrengen app; see repo for contact)';

console.log(`Syncing ${dbPath} against mafteiach.app's current live listing...`);

const db = openDatabase(dbPath);
const fetcher = new PoliteFetcher({ cacheDir, userAgent: USER_AGENT, delayMs });
const result = await syncAll({
  db,
  fetcher,
  onProgress: ({ phase, index, total }) => {
    process.stdout.write(`\r[${phase}] ${index}/${total}          `);
  },
});

console.log('\n\nSync complete:');
console.log(`  checked:    ${result.checked}`);
console.log(`  inserted:   ${result.inserted}${result.newIds.length ? ` (new ids: ${result.newIds.join(', ')})` : ''}`);
console.log(`  updated:    ${result.updated}`);
console.log(`  unchanged:  ${result.unchanged}`);
if (result.missingIds.length > 0) {
  console.log(`  ⚠ no longer listed on the site (kept in DB, not auto-deleted): ${result.missingIds.join(', ')}`);
}
