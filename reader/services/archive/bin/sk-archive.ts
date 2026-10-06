#!/usr/bin/env node
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { ArchiveStore } from '../src/store.js';
import { loadInventory } from '../src/inventory.js';
import type { InventoryResult } from '../src/inventory.js';
import { crawl } from '../src/crawl.js';
import { verify } from '../src/verify.js';
import { stats, unresolved } from '../src/report.js';
import { exportObjectsIndex } from '../src/objectsIndex.js';
import { importText } from '../src/importText.js';
import type { TextRecord } from '../src/importText.js';

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

function logCollections(collections: InventoryResult['collections']): void {
  for (const [collection, counts] of Object.entries(collections)) {
    log(`  ${collection}: ${counts.pdfs} Drive PDFs${counts.audio ? `, ${counts.audio} audio refs` : ''}${counts.nonDrive ? ` (${counts.nonDrive} links that are not Drive files)` : ''}`);
  }
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
      logCollections(result.collections);
    } finally {
      store.close();
    }
  });

program
  .command('crawl')
  .description('fetch every wanted file the archive does not hold yet')
  .option('--limit <n>', 'stop after this many urls', (v) => Number(v))
  .option('--source <jem|drive>', 'only one upstream')
  .option('--collection <id>', 'only the files of one collection (farbrengens, likkuteiSichos, ...)')
  .option('--scope <year[-month]>', 'only the files of items dated in a Hebrew year (5736) or month (5736-01)')
  .option('--concurrency <n>', 'connections per host', (v) => Number(v), 2)
  .option('--min-gap-ms <n>', 'minimum gap between request starts per host', (v) => Number(v), 1000)
  .option('--dry-run', 'only count what would be fetched')
  .option('--retry-unresolved', 'also ask again for what upstream said was gone')
  .action(async (opts: { limit?: number; source?: 'jem' | 'drive'; collection?: string; scope?: string; concurrency: number; minGapMs: number; dryRun?: boolean; retryUnresolved?: boolean }) => {
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
      logCollections(inv.collections);
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

/** The seforim an importer wrote (packages/sefaria-index's output), as text records: one per kept edition of each unit. */
async function worksRecords(dir: string): Promise<TextRecord[]> {
  const { readWorkImport, TEXT_OBJECT_MIME } = await import('@chassidushub-reader/sefaria-index');
  const { workTextSourceId, workUnitItemId } = await import('@chassidushub-reader/pack-format');
  const records: TextRecord[] = [];
  const workIds = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name).sort();
  for (const workId of workIds) {
    const { texts } = await readWorkImport(dir, workId);
    for (const [index, text] of texts.entries()) {
      const sha256 = createHash('sha256').update(text.html, 'utf8').digest('hex');
      records.push({ collection: 'works', itemId: workUnitItemId(workId, text.unitId), sourceId: workTextSourceId(workId, sha256), role: text.key, text: text.html, mime: TEXT_OBJECT_MIME, label: text.label, ord: index + 1 });
    }
  }
  return records;
}

program
  .command('import-text')
  .description("store texts that arrive as data as text objects: the seforim (works), or the Igros and Maanos - gated: kept in the archive, never packed until the rights are cleared")
  .requiredOption('--collection <id>', 'works, igros or maanos')
  .requiredOption('--dir <dir>', "works: packages/sefaria-index's output (data/); igros, maanos: packages/igros-index's build output")
  .option('--dry-run', 'count what would be stored; write nothing')
  .action(async (opts: { collection: string; dir: string; dryRun?: boolean }) => {
    if (opts.collection !== 'works' && opts.collection !== 'igros' && opts.collection !== 'maanos') throw new Error(`--collection must be works, igros or maanos, not ${opts.collection}`);
    let records: TextRecord[];
    if (opts.collection === 'works') records = await worksRecords(opts.dir);
    else {
      const { letterHtml, maanehHtml, readIgrosOutput, TEXT_OBJECT_MIME } = await import('@chassidushub-reader/igros-index');
      const output = readIgrosOutput(opts.dir);
      records =
        opts.collection === 'igros'
          ? output.letters.map((letter, index) => ({ collection: 'igros', itemId: letter.id, text: letterHtml(letter), mime: TEXT_OBJECT_MIME, label: letter.numberLabel, hebrewYear: letter.hebrewYear, ord: index + 1 }))
          : output.maanos.map((maaneh, index) => ({ collection: 'maanos', itemId: maaneh.id, text: maanehHtml(maaneh), mime: TEXT_OBJECT_MIME, label: maaneh.numberLabel, hebrewYear: maaneh.year, ord: index + 1 }));
    }
    const g = globals();
    const store = await ArchiveStore.open(g.root);
    try {
      const author = opts.collection === 'works' ? 'sefaria-import' : 'igros-import';
      const result = await importText(store, records, { author, message: `import-text ${opts.collection}: ${records.length} item(s) from ${opts.dir}`, dryRun: opts.dryRun, log });
      log(
        `import-text ${opts.collection}${opts.dryRun ? ' (dry run)' : ''}: ${result.records} item(s); ${result.added} new object(s), ${formatBytes(result.bytes)}; ${result.changed} changed, ${result.unchanged} unchanged`,
      );
    } finally {
      store.close();
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
