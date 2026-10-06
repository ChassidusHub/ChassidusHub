#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { rightsFor, workById, type Work } from '@sichos-kodesh/works';
import { sefariaClient } from '../src/client.js';
import { importWork } from '../src/importWork.js';
import { writeWorkImport } from '../src/output.js';
import { sefariaWorks } from '../src/works.js';

/**
 * sefaria-index: Sefaria's Chabad texts as units and editions of the works
 * in packages/works (docs/chabad-library-plan.md, WP11). See README.md.
 */

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const program = new Command().name('sefaria-index').description("Import Sefaria's Chabad texts with their licences.");

program
  .command('list')
  .description('the works with Sefaria copies, each version with what the rights gate decides')
  .action(() => {
    for (const work of sefariaWorks()) {
      console.log(`${work.id} (${work.title.en})`);
      for (const source of work.sources.filter((s) => s.source === 'sefaria')) {
        console.log(`  ${source.sourceId} | ${source.language} | ${source.version} | ${source.licence} -> ${rightsFor(source)}`);
      }
    }
  });

program
  .command('import')
  .description('fetch (or read from the cache) each work, and write its units, editions and kept texts')
  .option('--work <id...>', 'work ids (default: every work with Sefaria copies)')
  .option('--out <dir>', 'output folder', path.join(packageDir, 'data'))
  .option('--cache <dir>', "where Sefaria's answers are kept", path.join(packageDir, '.cache'))
  .option('--delay-ms <n>', 'pause between requests to Sefaria', (v) => Number(v), 500)
  .option('--refresh', 'ask Sefaria again even for cached answers')
  .action(async (opts: { work?: string[]; out: string; cache: string; delayMs: number; refresh?: boolean }) => {
    const works: Work[] = opts.work
      ? opts.work.map((id) => {
          const work = workById(id);
          if (!work) throw new Error(`no work "${id}" in packages/works`);
          if (!work.sources.some((s) => s.source === 'sefaria')) throw new Error(`${id} has no Sefaria copies`);
          return work;
        })
      : sefariaWorks();
    const client = sefariaClient({ cacheDir: opts.cache, delayMs: opts.delayMs, refresh: opts.refresh });
    const totals = { units: 0, text: 0, links: 0, bytes: 0, warnings: 0 };
    for (const work of works) {
      const before = client.requests;
      const result = await importWork(work, client, { log: (line) => console.log(`  ${line}`) });
      await writeWorkImport(opts.out, result);
      const r = result.report;
      console.log(
        `${work.id}: ${r.units} units; ${r.textEditions} texts kept (${formatBytes(r.textBytes)}), ${r.linkEditions} links; ${client.requests - before} requests` +
          (r.warnings.length ? `; ${r.warnings.length} warnings` : ''),
      );
      totals.units += r.units;
      totals.text += r.textEditions;
      totals.links += r.linkEditions;
      totals.bytes += r.textBytes;
      totals.warnings += r.warnings.length;
    }
    console.log(
      `total: ${works.length} works, ${totals.units} units; ${totals.text} texts kept (${formatBytes(totals.bytes)}), ${totals.links} links; ${client.requests} requests; ${totals.warnings} warnings -> ${opts.out}`,
    );
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
