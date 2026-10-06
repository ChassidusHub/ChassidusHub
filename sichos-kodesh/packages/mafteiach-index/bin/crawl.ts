#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlAll } from '../src/crawl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const outDir = arg('out', path.join(__dirname, '..', 'data'));
const cacheDir = arg('cache', path.join(__dirname, '..', '.cache'));
const delayMs = Number(arg('delay-ms', '750'));

const USER_AGENT =
  'SichosKodeshAppResearch/0.1 (+https://github.com/ChassidusHub/ChassidusHub; building an offline kvius-scheduled farbrengen app; see repo for contact)';

console.log(`Crawling mafteiach.app's full real coverage (pre-Nesius bucket + years 5710-5752) -> ${outDir} (cache: ${cacheDir}, delay: ${delayMs}ms)`);

const byYear = await crawlAll({
  outDir,
  cacheDir,
  userAgent: USER_AGENT,
  delayMs,
  onProgress: ({ index, total, id }) => {
    process.stdout.write(`\r${index}/${total} (id ${id})          `);
  },
});

const totalRecords = [...byYear.values()].reduce((sum, records) => sum + records.length, 0);
console.log(`\nDone. ${totalRecords} unique farbrengen/sicha entries across ${byYear.size} Hebrew years.`);
