#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, replaceJemAudio } from '../src/db.js';
import { extractAshreinuEventId, resolveJemAudio } from '../src/jemAudio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const dbPath = arg('db', path.join(__dirname, '..', 'mafteiach.db'));
const delayMs = Number(arg('delay-ms', '400'));
const limit = arg('limit', '') ? Number(arg('limit', '0')) : undefined;

const db = openDatabase(dbPath);
const rows = db
  .prepare("SELECT occasion_id, url FROM links WHERE section = 'audio'")
  .all() as { occasion_id: number; url: string }[];

const targets = limit ? rows.slice(0, limit) : rows;
console.log(`Resolving JEM audio for ${targets.length} occasion(s) (of ${rows.length} total audio links)...`);

let resolved = 0;
let noEventId = 0;
let noRecordingsFound = 0;
let httpErrors = 0;
const now = new Date().toISOString();

for (let i = 0; i < targets.length; i++) {
  const { occasion_id: occasionId, url } = targets[i]!;
  const eventId = extractAshreinuEventId(url);
  if (eventId === null) {
    noEventId++;
    continue;
  }

  try {
    const recordings = await resolveJemAudio(eventId);
    await sleep(delayMs);
    if (recordings.length === 0) {
      noRecordingsFound++;
      continue;
    }
    const flatAssets = recordings.flatMap((r) =>
      r.assets.map((a) => ({ ccdbEventId: r.eventId, durationMs: r.durationMs, url: a.url, fileFormat: a.fileFormat })),
    );
    replaceJemAudio(db, occasionId, flatAssets, now);
    resolved++;
  } catch (error) {
    httpErrors++;
    console.error(`  occasion ${occasionId} (event ${eventId}): ${(error as Error).message}`);
    await sleep(delayMs);
  }

  if ((i + 1) % 50 === 0) {
    process.stdout.write(`\r${i + 1}/${targets.length}          `);
  }
}

console.log(`\n\nDone. resolved=${resolved} noEventId=${noEventId} noRecordingsFound=${noRecordingsFound} httpErrors=${httpErrors}`);
