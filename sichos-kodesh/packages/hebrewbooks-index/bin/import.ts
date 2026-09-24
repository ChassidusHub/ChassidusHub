#!/usr/bin/env node
/**
 * Reads Otzaria's HebrewBooks catalog and writes the Chabad shelf:
 *
 *   --catalog <file>   otzar-HB_catalog.db.zst (or the .db inside it); download it from
 *                      https://github.com/Otzaria/otzar-HB_catalog/releases/latest/download/otzar-HB_catalog.db.zst
 *   --out <file>       default: packages/hebrewbooks-index/data/shelf.json (gitignored)
 *
 * packages/works' build-catalog-works reads the output and places each
 * series with its sefer.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildShelf, readCatalog, shelfSize } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const catalogFile = arg('catalog');
if (!catalogFile) {
  console.error('Usage: import-hebrewbooks --catalog <otzar-HB_catalog.db.zst> [--out <shelf.json>]');
  process.exit(1);
}
const out = arg('out') ?? path.join(__dirname, '..', 'data', 'shelf.json');

const catalog = readCatalog(catalogFile);
const shelf = buildShelf(catalog.rows, catalog.version);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(shelf, null, 1)}\n`, 'utf8');

console.log(`Otzaria's catalog version ${catalog.version}: ${catalog.rows.length} books; ${shelfSize(shelf)} on the Chabad shelf.`);
for (const author of shelf.authors) {
  const scans = author.series.reduce((n, s) => n + s.scans.length, 0);
  console.log(`  ${(author.authorId ?? 'others').padEnd(18)} ${String(scans).padStart(5)} scans in ${author.series.length} series`);
}
console.log(`Wrote ${out}`);
