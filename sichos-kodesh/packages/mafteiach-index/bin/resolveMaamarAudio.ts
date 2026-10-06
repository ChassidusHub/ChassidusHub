#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db.js';
import { extractAshreinuEventId, extractAshreinuParentEventId } from '../src/jemAudio.js';
import { resolveAudioLinks } from '../src/resolveAudioLinks.js';
import { pickMaamarPart, replaceMaamarJemAudio } from '../src/sections/maamorim.js';

/**
 * The maamorim counterpart of resolveJemAudio.ts. A maamar's ashreinu link
 * points at the maamar's own ccdb event (parentEvent~1_event~4: event 4 is
 * the maamar, 1 the whole farbrengen), so it resolves from that event, not
 * the parent - the parent would bring every sicha of the farbrengen along.
 * When JEM has renumbered the farbrengen's parts and the maamar's event is
 * gone (a 404), the farbrengen's part named as a maamar is taken instead,
 * if it has exactly one.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const dbPath = arg('db', path.join(__dirname, '..', 'mafteiach.db'));
const delayMs = Number(arg('delay-ms', '400'));
const limit = arg('limit', '') ? Number(arg('limit', '0')) : undefined;

// --missing-only: just the maamorim with an audio link and no resolved recordings yet.
const missingOnly = process.argv.includes('--missing-only');

const db = openDatabase(dbPath);
const rows = db
  .prepare(
    `SELECT maamor_id, url FROM maamorim_links WHERE section = 'audio'${missingOnly ? ' AND maamor_id NOT IN (SELECT maamor_id FROM maamor_jem_audio)' : ''} ORDER BY maamor_id`,
  )
  .all() as { maamor_id: number; url: string }[];

console.log(`Resolving JEM audio for ${limit ? Math.min(limit, rows.length) : rows.length} maamar(im) (of ${rows.length} with an audio link)...`);

const now = new Date().toISOString();
const result = await resolveAudioLinks({
  rows: rows.map((row) => ({ key: row.maamor_id, url: row.url })),
  eventIdOf: (url) => extractAshreinuEventId(url) ?? extractAshreinuParentEventId(url),
  fallback: { eventIdOf: extractAshreinuParentEventId, pick: pickMaamarPart },
  replace: (maamorId, recordings) => replaceMaamarJemAudio(db, maamorId, recordings, now),
  delayMs,
  limit,
  log: (line) => console.error(line),
  onProgress: (index, total) => {
    if (index % 50 === 0) process.stdout.write(`\r${index}/${total}          `);
  },
});

console.log(
  `\n\nDone. resolved=${result.resolved} (${result.resolvedByFallback} through the farbrengen's maamar part) noEventId=${result.noEventId} noRecordingsFound=${result.noRecordingsFound} unmatched=${result.unmatched} httpErrors=${result.httpErrors}`,
);
