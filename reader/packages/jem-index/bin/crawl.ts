#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlAll } from '../src/crawl.js';
import { openDatabase } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const dbPath = arg('db', path.join(__dirname, '..', 'jem.db'));
const cacheDir = arg('cache', path.join(__dirname, '..', '.cache'));
const delayMs = Number(arg('delay-ms', '400'));
const yearsArg = arg('years', '');
const years = yearsArg ? yearsArg.split(',').map(Number) : undefined;

const USER_AGENT =
  'ChassidusHubAppResearch/0.1 (+https://github.com/ChassidusHub/ChassidusHub; building an offline kvius-scheduled farbrengen app; see repo for contact)';

console.log(
  `Crawling JEM's ccdb catalog (${years ? `years ${years.join(',')}` : 'every year with audio'}) -> ${dbPath} (cache: ${cacheDir}, delay: ${delayMs}ms)`,
);

const db = openDatabase(dbPath);

const summary = await crawlAll({
  db,
  cacheDir,
  userAgent: USER_AGENT,
  delayMs,
  years,
  onProgress: ({ index, total, year, eventId }) => {
    process.stdout.write(`\r${index}/${total} (year ${year}, event ${eventId})          `);
  },
});

console.log(
  `\nDone. ${summary.topLevelEvents} top-level events across ${summary.years} years -> ${summary.totalNodes} total nodes ` +
    `(inserted=${summary.inserted} updated=${summary.updated} unchanged=${summary.unchanged}), ${summary.recordings} audio recordings.`,
);
