#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, replaceJemAudio } from '../src/db.js';
import { extractAshreinuEventId, extractAshreinuParentEventId } from '../src/jemAudio.js';
import { resolveAudioLinks } from '../src/resolveAudioLinks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const dbPath = arg('db', path.join(__dirname, '..', 'mafteiach.db'));
const delayMs = Number(arg('delay-ms', '400'));
const limit = arg('limit', '') ? Number(arg('limit', '0')) : undefined;

const db = openDatabase(dbPath);
const rows = db
  .prepare("SELECT occasion_id, url FROM links WHERE section = 'audio'")
  .all() as { occasion_id: number; url: string }[];

console.log(`Resolving JEM audio for ${limit ? Math.min(limit, rows.length) : rows.length} occasion(s) (of ${rows.length} total audio links)...`);

const now = new Date().toISOString();
const result = await resolveAudioLinks({
  rows: rows.map((row) => ({ key: row.occasion_id, url: row.url })),
  // Resolves from the *parent* (farbrengen) event, not the specific leaf/sicha
  // id the crawled link points to: the leaf alone only returns that one
  // sicha's own recording, missing every sibling sicha/maamar under the same
  // farbrengen (see jemAudio.ts). Falls back to the leaf id only if a URL has
  // no parent segment at all (shouldn't happen for a real ashreinu.app link,
  // but keeps a malformed one from being skipped entirely).
  eventIdOf: (url) => extractAshreinuParentEventId(url) ?? extractAshreinuEventId(url),
  replace: (occasionId, recordings) => replaceJemAudio(db, occasionId, recordings, now),
  delayMs,
  limit,
  log: (line) => console.error(line),
  onProgress: (index, total) => {
    if (index % 50 === 0) process.stdout.write(`\r${index}/${total}          `);
  },
});

console.log(`\n\nDone. resolved=${result.resolved} noEventId=${result.noEventId} noRecordingsFound=${result.noRecordingsFound} httpErrors=${result.httpErrors}`);
