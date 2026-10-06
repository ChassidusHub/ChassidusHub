import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { dumpPGlite, openPGlite } from '@chassidushub/db/pglite';
import { seedCatalog } from './seed.js';

declare module 'vitest' {
  export interface ProvidedContext {
    /** A file holding the tests' starting catalog, for freshCatalog to open (helpers.ts). */
    pgliteTemplate: string | null;
  }
}

/**
 * Builds the tests' starting catalog once a run and saves it to a file:
 * starting an empty PGlite and migrating it took seconds in every test file,
 * opening the copy takes well under one.
 */
export default async function setup(project: TestProject) {
  if (process.env.CHASSIDUSHUB_TEST_DATABASE_URL) {
    project.provide('pgliteTemplate', null);
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'chassidushub-tests-'));
  const db = await openPGlite();
  await seedCatalog(db);
  // Written out first, or a copy reopens with every sequence 32 ahead (Postgres logs them ahead).
  await db.exec('CHECKPOINT');
  const file = join(dir, 'catalog.tar');
  await writeFile(file, new Uint8Array(await (await dumpPGlite(db)).arrayBuffer()));
  await db.close();
  project.provide('pgliteTemplate', file);
  return () => rm(dir, { recursive: true, force: true });
}
