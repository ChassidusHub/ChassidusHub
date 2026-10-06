#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, upsertRecord } from '../src/db.js';
import type { FarbrengenRecord } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const dataDir = arg('data', path.join(__dirname, '..', 'data'));
const dbPath = arg('db', path.join(__dirname, '..', 'mafteiach.db'));

const db = openDatabase(dbPath);
const files = (await readdir(dataDir)).filter((f) => f.endsWith('.json'));
const now = new Date().toISOString();

let total = 0;
for (const file of files) {
  const records: FarbrengenRecord[] = JSON.parse(await readFile(path.join(dataDir, file), 'utf8'));
  for (const record of records) {
    upsertRecord(db, record, null, now);
    total++;
  }
}

console.log(`Loaded ${total} records from ${files.length} year files into ${dbPath}`);
