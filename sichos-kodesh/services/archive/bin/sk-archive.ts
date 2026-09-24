#!/usr/bin/env node
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { ArchiveStore } from '../src/store.js';
import { loadInventory } from '../src/inventory.js';
import { crawl } from '../src/crawl.js';
import { verify } from '../src/verify.js';
import { stats, unresolved } from '../src/report.js';
import { exportObjectsIndex } from '../src/objectsIndex.js';

/**
 * sk-archive: the canonical archive's command line. Every command takes
 * the archive root (--root or SK_ARCHIVE_ROOT) and the two indexer
 * databases it reads its inventory from. See README.md for the routine.
 */

const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, '..', '..', '..');

const program = new Command()
  .name('sk-archive')
  .description('The canonical archive of upstream media: fetch once, store by hash, verify, report.')
  .option('--root <dir>', 'archive root', process.env.SK_ARCHIVE_ROOT ?? path.resolve(process.cwd(), 'archive'))
  .option('--jem-db <file>', 'packages/jem-index database', process.env.SK_JEM_DB ?? path.join(repoRoot, 'packages', 'jem-index', 'jem.db'))
  .option('--mafteiach-db <file>', 'packages/mafteiach-index database', process.env.SK_MAFTEIACH_DB ?? path.join(repoRoot, 'packages', 'mafteiach-index', 'mafteiach.db'));

interface GlobalOptions {
  root: string;
  jemDb: string;
  mafteiachDb: string;
}

function globals(): GlobalOptions {
  return program.opts<GlobalOptions>();
}

const log = (line: string) => console.log(line);

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

program
  .command('inventory')
  .description('read the indexers and record what the archive should hold (upsert; safe to repeat)')
  .action(async () => {
    const g = globals();
    const store = await ArchiveStore.open(g.root);
    try {
      const result = loadInventory(store, { jemDb: g.jemDb, mafteiachDb: g.mafteiachDb });
      log(`inventory: ${result.audio} JEM recordings, ${result.pdfs} Drive PDFs, ${result.farbrengenAudioRefs} farbrengen audio refs (skipped ${result.skipped.nonDriveLinks} non-Drive links, ${result.skipped.badDriveUrls} unparsable Drive urls)`);
    } finally {
      store.close();
    }
  });

program
  .command('crawl')
  .description('fetch every wanted file the archive does not hold yet')
  .option('--limit <n>', 'stop after this many urls', (v) => Number(v))
  .option('--source <jem|drive>', 'only one upstream')
  .option('--concurrency <n>', 'connections per host', (v) => Number(v), 2)
  .option('--min-gap-ms <n>', 'minimum gap between request starts per host', (v) => Number(v), 1000)
  .option('--dry-run', 'only count what would be fetched')
  .action(async (opts: { limit?: number; source?: 'jem' | 'drive'; concurrency: number; minGapMs: number; dryRun?: boolean }) => {
    const g = globals();
    const store = await ArchiveStore.open(g.root);
    try {
      const result = await crawl(store, { ...opts, log });
      log(`crawl: ${result.fetched} fetched (${formatBytes(result.bytes)}), ${result.skippedExisting} already stored, ${result.unresolved} unresolved, ${result.errors} errors, ${result.attempted} attempted`);
    } finally {
      store.close();
    }
  });

program
  .command('sync')
  .description('inventory, then crawl - the nightly job')
  .option('--limit <n>', 'stop after this many urls', (v) => Number(v))
  .option('--concurrency <n>', 'connections per host', (v) => Number(v), 2)
  .action(async (opts: { limit?: number; concurrency: number }) => {
    const g = globals();
    const store = await ArchiveStore.open(g.root);
    try {
      const inv = loadInventory(store, { jemDb: g.jemDb, mafteiachDb: g.mafteiachDb });
      log(`inventory: ${inv.audio} JEM recordings, ${inv.pdfs} Drive PDFs`);
      const result = await crawl(store, { ...opts, log });
      log(`crawl: ${result.fetched} fetched (${formatBytes(result.bytes)}), ${result.unresolved} unresolved, ${result.errors} errors`);
    } finally {
      store.close();
    }
  });

program
  .command('verify')
  .description('re-hash stored objects: a 2% sample by default, --full for everything')
  .option('--sample <fraction>', 'fraction of objects to check', (v) => Number(v), 0.02)
  .option('--full', 'check every object')
  .action(async (opts: { sample: number; full?: boolean }) => {
    const g = globals();
    const store = await ArchiveStore.open(g.root);
    try {
      const result = await verify(store, { sample: opts.full ? 1 : opts.sample, log });
      log(`verify: ${result.ok}/${result.checked} ok, ${result.missing.length} missing, ${result.corrupt.length} corrupt`);
      if (result.missing.length + result.corrupt.length > 0) process.exitCode = 1;
    } finally {
      store.close();
    }
  });

program
  .command('stats')
  .description('what the archive holds')
  .option('--json', 'machine-readable')
  .action(async (opts: { json?: boolean }) => {
    const g = globals();
    const store = await ArchiveStore.open(g.root);
    try {
      const s = stats(store);
      if (opts.json) {
        log(JSON.stringify(s, null, 2));
        return;
      }
      log(`objects: ${s.objects.count} (${formatBytes(s.objects.bytes)}) - ${s.objects.audio} audio, ${s.objects.pdf} pdf, ${s.objects.text} text${s.objects.lost ? `; ${s.objects.lost} lost (bytes missing or corrupt; the next crawl re-fetches them)` : ''}`);
      log(`wanted urls: ${s.wanted.urls} - ${s.wanted.fetched} fetched, ${s.wanted.pending} pending, ${s.wanted.unresolved} unresolved, ${s.wanted.errored} errored`);
      log(`refs: ${s.refs}; commits: ${s.commits}${s.lastCommit ? `; last: ${s.lastCommit.created_at} ${s.lastCommit.author} "${s.lastCommit.message}"` : ''}`);
    } finally {
      store.close();
    }
  });

program
  .command('report-unresolved')
  .description('every item with a file the archive could not fetch, grouped by item')
  .option('--json', 'machine-readable')
  .action(async (opts: { json?: boolean }) => {
    const g = globals();
    const store = await ArchiveStore.open(g.root);
    try {
      const items = unresolved(store);
      if (opts.json) {
        log(JSON.stringify(items, null, 2));
        return;
      }
      for (const item of items) {
        log(`${item.collection} ${item.item_id} (${item.hebrew_date ?? item.hebrew_year ?? '?'})`);
        for (const file of item.files) log(`  ${file.kind} ${file.role} ${file.source_id} - HTTP ${file.http_status ?? '-'} ${file.error ?? ''} (${file.attempts} attempts)`);
      }
      log(`${items.length} item(s) with unresolved files`);
    } finally {
      store.close();
    }
  });

program
  .command('export-objects-index')
  .description('write objects.json (the trust anchor for loose files) from the store')
  .requiredOption('--catalog-version <v>', 'the catalog version this index goes with')
  .option('--out <file>', 'output file', 'objects.json')
  .action(async (opts: { catalogVersion: string; out: string }) => {
    const g = globals();
    const store = await ArchiveStore.open(g.root);
    try {
      const index = exportObjectsIndex(store, opts.catalogVersion);
      await writeFile(opts.out, JSON.stringify(index));
      log(`wrote ${opts.out}: ${Object.keys(index.objects).length} objects`);
    } finally {
      store.close();
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
