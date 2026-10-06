import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.js';

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  if (!row) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
  } else if (Number(row.value) !== SCHEMA_VERSION) {
    throw new Error(`archive store schema ${row.value} is not the ${SCHEMA_VERSION} this build expects`);
  }
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}
