import type { Db } from './db.js';
import * as catalog from './migrations/0001_catalog.js';
import * as pageFixes from './migrations/0002_page_fixes.js';
import * as auth from './migrations/0003_auth.js';
import * as google from './migrations/0004_google.js';
import * as steward from './migrations/0005_steward.js';
import * as admin from './migrations/0006_admin.js';
import * as projectFocus from './migrations/0007_project_focus.js';
import * as webhooks from './migrations/0008_webhooks.js';
import * as archiveGaps from './migrations/0009_archive_gaps.js';
import * as network from './migrations/0010_network.js';
import * as emailNotifyAdvice from './migrations/0011_email_notify_advice.js';
import * as scansAndTeshuros from './migrations/0012_scans_and_teshuros.js';
import * as projectClaims from './migrations/0013_project_claims.js';
import * as readingPlaces from './migrations/0014_reading_places.js';
import * as pageWords from './migrations/0015_page_words.js';
import * as peopleAndThreads from './migrations/0016_people_and_threads.js';
import * as covers from './migrations/0017_covers.js';
import * as apiTokens from './migrations/0018_api_tokens.js';
import * as listingIndexes from './migrations/0019_listing_indexes.js';
import * as driveFiles from './migrations/0020_drive_files.js';
import * as oauth from './migrations/0021_oauth.js';
import * as entityForward from './migrations/0022_entity_forward.js';
import * as machineRequests from './migrations/0023_machine_requests.js';
import * as searchVector from './migrations/0024_search_vector.js';
import * as dropSearchExpressionIndex from './migrations/0025_drop_search_expression_index.js';
import * as revisionAbout from './migrations/0026_revision_about.js';
import * as machineWords from './migrations/0027_machine_words.js';
import * as catalogHold from './migrations/0028_catalog_hold.js';
import * as drafts from './migrations/0029_drafts.js';
import * as unitPlace from './migrations/0030_unit_place.js';
import * as jitOff from './migrations/0031_jit_off.js';
import * as unitPlaceNames from './migrations/0032_unit_place_names.js';
import * as unitLead from './migrations/0033_unit_lead.js';
import * as unitLeadFill from './migrations/0034_unit_lead_fill.js';
import * as unitLeadIndex from './migrations/0035_unit_lead_index.js';
import * as unitPlaceIdCollation from './migrations/0036_unit_place_id_collation.js';
import * as unitPlacePart from './migrations/0037_unit_place_part.js';
import * as changesetClientKey from './migrations/0038_changeset_client_key.js';
import { HOLD_EVERY_TABLE_SQL } from './hold.js';

export interface Migration {
  version: number;
  name: string;
  up: string;
  /**
   * Runs outside a transaction, a statement at a time: what `CREATE INDEX
   * CONCURRENTLY` needs, which builds an index while the table goes on
   * taking writes. A plain CREATE INDEX holds every write to its table until
   * the build ends, and an index over every sicha's words takes minutes on
   * live. Such a migration must be safe to run again from the start, since
   * a deploy that stops halfway leaves what it did (an index left invalid
   * is dropped and built again: `DROP INDEX CONCURRENTLY IF EXISTS` first).
   */
  outside?: boolean;
}

/** Every migration, in order. A migration is never edited once released; a change is a new one. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'catalog', up: catalog.up },
  { version: 2, name: 'page fixes', up: pageFixes.up },
  { version: 3, name: 'auth', up: auth.up },
  { version: 4, name: 'google', up: google.up },
  { version: 5, name: 'steward', up: steward.up },
  { version: 6, name: 'admin', up: admin.up },
  { version: 7, name: 'project-focus', up: projectFocus.up },
  { version: 8, name: 'webhooks', up: webhooks.up },
  { version: 9, name: 'archive-gaps', up: archiveGaps.up },
  { version: 10, name: 'network', up: network.up },
  { version: 11, name: 'email-notify-advice', up: emailNotifyAdvice.up },
  { version: 12, name: 'scans-and-teshuros', up: scansAndTeshuros.up },
  { version: 13, name: 'project-claims', up: projectClaims.up },
  { version: 14, name: 'reading-places', up: readingPlaces.up },
  { version: 15, name: 'page-words', up: pageWords.up },
  { version: 16, name: 'people-and-threads', up: peopleAndThreads.up },
  { version: 17, name: 'covers', up: covers.up },
  { version: 18, name: 'api-tokens', up: apiTokens.up },
  { version: 19, name: 'listing-indexes', up: listingIndexes.up },
  { version: 20, name: 'drive-files', up: driveFiles.up },
  { version: 21, name: 'oauth', up: oauth.up },
  { version: 22, name: 'entity-forward', up: entityForward.up },
  { version: 23, name: 'machine-requests', up: machineRequests.up },
  { version: 24, name: 'search-vector', up: searchVector.up },
  { version: 25, name: 'drop-search-expression-index', up: dropSearchExpressionIndex.up },
  { version: 26, name: 'revision-about', up: revisionAbout.up },
  { version: 27, name: 'machine-words', up: machineWords.up },
  { version: 28, name: 'catalog-hold', up: catalogHold.up },
  { version: 29, name: 'drafts', up: drafts.up },
  { version: 30, name: 'unit-place', up: unitPlace.up },
  { version: 31, name: 'jit-off', up: jitOff.up },
  { version: 32, name: 'unit-place-names', up: unitPlaceNames.up },
  { version: 33, name: 'unit-lead', up: unitLead.up },
  { version: 34, name: 'unit-lead-fill', up: unitLeadFill.up },
  { version: 35, name: 'unit-lead-index', up: unitLeadIndex.up },
  { version: 36, name: 'unit-place-id-collation', up: unitPlaceIdCollation.up },
  { version: 37, name: 'unit-place-part', up: unitPlacePart.up },
  { version: 38, name: 'changeset-client-key', up: changesetClientKey.up },
];

/** Postgres's code for a statement that gave up waiting for a lock (`lock_timeout`). */
const LOCK_NOT_AVAILABLE = '55P03';

export interface MigrateOptions {
  /** How many times a migration that gave up waiting for a lock is tried in all (default 40). */
  lockTries?: number;
  /** The pause between those tries (default 3 s). */
  lockPauseMs?: number;
  log?: (line: string) => void;
}

/**
 * Applies the migrations `db` has not had yet, each in its own transaction (or, marked `outside`, a statement at a
 * time). Returns the versions applied.
 *
 * A migration that changes a table in use sets a short `lock_timeout`, so it never keeps the site's reads queued
 * behind it. When a long read holds the table (the catalog snapshot read for 27-43 s on live), the migration gives
 * up, and the deploy with it: 0038 did, and every deploy after failed the same way. So a migration that gave up on a
 * lock is tried again after a pause, up to `lockTries` times (two minutes by default), each try a whole new transaction
 * that waits at most its own `lock_timeout`, so it finds a moment the table is free.
 */
export async function migrate(db: Db, options: MigrateOptions = {}): Promise<number[]> {
  const tries = Math.max(options.lockTries ?? 40, 1);
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { rows } = await db.query<{ version: number }>('SELECT version FROM schema_migration');
  const done = new Set(rows.map((r) => r.version));
  const applied: number[] = [];
  for (const migration of MIGRATIONS) {
    if (done.has(migration.version)) continue;
    if (migration.outside) {
      for (const statement of statementsOf(migration.up)) await db.exec(statement);
      await db.query('INSERT INTO schema_migration (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
      applied.push(migration.version);
      continue;
    }
    for (let attempt = 1; ; attempt++) {
      try {
        await db.transaction(async (tx) => {
          await tx.exec(migration.up);
          await tx.query('INSERT INTO schema_migration (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
        });
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== LOCK_NOT_AVAILABLE || attempt >= tries) throw error;
        options.log?.(`migration ${migration.version} (${migration.name}) waited too long for a lock; trying again (${attempt + 1} of ${tries})`);
        await new Promise((resolve) => setTimeout(resolve, options.lockPauseMs ?? 3000));
      }
    }
    applied.push(migration.version);
  }
  // A table a migration added is held while an import runs, like the rest (hold.ts).
  if (applied.length && applied.at(-1)! >= 28) await db.exec(HOLD_EVERY_TABLE_SQL);
  return applied;
}

/** A migration's statements one by one: sent together they would run as one transaction. Statements end in `;` and a newline. */
export function statementsOf(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ''))
    .filter((s) => s.length > 0);
}

/** Creates yearly partitions of `revision` for the years given, so the default partition stays small. */
export async function ensureRevisionPartitions(db: Db, years: readonly number[]): Promise<void> {
  for (const year of years) {
    await db.exec(
      `CREATE TABLE IF NOT EXISTS revision_${year} PARTITION OF revision FOR VALUES FROM ('${year}-01-01') TO ('${year + 1}-01-01')`,
    );
  }
}
