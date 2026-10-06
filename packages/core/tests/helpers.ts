import { connectPostgres, type Db } from '@chassidushub/db';
import { openPGlite } from '@chassidushub/db/pglite';
import { readFile } from 'node:fs/promises';
import { inject } from 'vitest';
import { Catalog, type Json } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { catalog, seedCatalog } from './seed.js';

let shared: Promise<Db> | null = null;
let first = true;
let snapshot: Promise<Snapshot> | null = null;

/**
 * A fresh catalog in memory, with a steward, a keeper, two contributors
 * and a bot, and one moderated set kept by the keeper. One PGlite per test
 * file, started as a copy of that catalog (globalSetup.ts builds it once a
 * run), and put back to it for every test. With CHASSIDUSHUB_TEST_DATABASE_URL
 * set, a real Postgres server instead, built afresh for every test; its public
 * and auth schemas are dropped, so never point it at real data.
 */
export async function freshCatalog() {
  const url = process.env.CHASSIDUSHUB_TEST_DATABASE_URL;
  if (url) {
    shared ??= Promise.resolve(connectPostgres(url, { max: 4 }));
    const db = await shared;
    await db.exec('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    return seedCatalog(db);
  }
  shared ??= openTemplate();
  const db = await shared;
  if (first) {
    // A database just opened is the starting catalog already.
    first = false;
    snapshot = takeSnapshot(db);
  } else if (!(await restore(db, await snapshot!))) {
    // A test changed the tables themselves, so build the catalog again.
    await db.exec('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    return seedCatalog(db);
  }
  return { db, catalog: catalog(db), set: (await snapshot!).set };
}

async function openTemplate(): Promise<Db> {
  const path = inject('pgliteTemplate');
  if (path) return openPGlite(undefined, new Blob([await readFile(path)]));
  // Run without the root config's globalSetup: start an empty database.
  const db = await openPGlite();
  await seedCatalog(db);
  return db;
}

interface Snapshot {
  /** What the tables, functions and triggers are, to tell whether a test changed them. */
  shape: string;
  tables: { name: string; columns: string; rows: string }[];
  sequences: { name: string; value: number }[];
  /** The moderated set the catalog starts with. */
  set: EntityId;
}

const SCHEMAS = "('public', 'auth')";

async function shape(db: Db): Promise<string> {
  const { rows } = await db.query<{ shape: string }>(`
    SELECT md5(coalesce(string_agg(x, ',' ORDER BY x), '')) AS shape FROM (
      SELECT nspname AS x FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
      UNION ALL SELECT format('%s.%s:%s', n.nspname, c.relname, c.relkind) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ${SCHEMAS}
      UNION ALL SELECT format('%s.%s:%s', a.attrelid::regclass, a.attname, format_type(a.atttypid, a.atttypmod)) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ${SCHEMAS} AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL SELECT format('%s:%s:%s', t.tgrelid::regclass, t.tgname, t.tgenabled) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ${SCHEMAS}
      UNION ALL SELECT format('%s:%s', co.conrelid::regclass, co.conname) FROM pg_constraint co JOIN pg_namespace n ON n.oid = co.connamespace WHERE n.nspname IN ${SCHEMAS}
      UNION ALL SELECT format('%s:%s', p.oid::regprocedure, md5(p.prosrc)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ${SCHEMAS}
    ) s`);
  return rows[0]!.shape;
}

async function takeSnapshot(db: Db): Promise<Snapshot> {
  const { rows: names } = await db.query<{ name: string }>(
    `SELECT format('%I.%I', n.nspname, c.relname) AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ${SCHEMAS} AND c.relkind IN ('r', 'p') AND NOT c.relispartition ORDER BY 1`,
  );
  const tables: Snapshot['tables'] = [];
  for (const { name } of names) {
    // Generated columns are made again from the others.
    const { rows: [cols] } = await db.query<{ columns: string }>(
      `SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) AS columns FROM pg_attribute
       WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = ''`,
      [name],
    );
    const { rows: [data] } = await db.query<{ rows: string }>(`SELECT coalesce(json_agg(x), '[]')::text AS rows FROM ${name} x`);
    tables.push({ name, columns: cols!.columns, rows: data!.rows });
  }
  const { rows: sequences } = await db.query<{ name: string; value: number }>(
    `SELECT format('%I.%I', schemaname, sequencename) AS name, last_value AS value FROM pg_sequences WHERE schemaname IN ${SCHEMAS} AND last_value IS NOT NULL`,
  );
  const { rows: [set] } = await db.query<{ id: EntityId }>("SELECT id FROM entity WHERE type = 'set'");
  return { shape: await shape(db), tables, sequences, set: set!.id };
}

/** Puts every row back as the snapshot has it; false when the tables themselves changed. */
async function restore(db: Db, snap: Snapshot): Promise<boolean> {
  if ((await shape(db)) !== snap.shape) return false;
  await db.transaction(async (tx) => {
    // Triggers stay off while the rows go back: they ran when the rows were first written.
    await tx.exec(`SET LOCAL session_replication_role = replica; TRUNCATE ${snap.tables.map((t) => t.name).join(', ')} RESTART IDENTITY CASCADE;`);
    for (const t of snap.tables) {
      if (t.rows === '[]') continue;
      await tx.query(`INSERT INTO ${t.name} (${t.columns}) OVERRIDING SYSTEM VALUE SELECT ${t.columns} FROM json_populate_recordset(NULL::${t.name}, $1)`, [t.rows]);
    }
    for (const s of snap.sequences) await tx.query('SELECT setval($1::regclass, $2, true)', [s.name, s.value]);
  });
  return true;
}

/** Suggests one item and merges it, as `author` then `reviewer`. */
export async function add(catalog: Catalog, author: string, reviewer: string, type: Parameters<Catalog['putRevision']>[2]['type'], data: Json, path?: string): Promise<EntityId> {
  const cs = await catalog.createChangeset(author, { title: `Add ${type}` });
  const id = await catalog.putRevision(cs.id, author, { type, data, path });
  await catalog.submit(cs.id, author);
  const after = await catalog.changeset(cs.id);
  if (after.status !== 'merged') await catalog.merge(cs.id, reviewer);
  return id;
}

export const yudShvat = (set: EntityId) => ({ kind: 'farbrengen', title: { he: 'יו״ד שבט תשמ״ב', en: 'Yud Shvat 5742' }, date: '5742-05-10', sets: [set] });
