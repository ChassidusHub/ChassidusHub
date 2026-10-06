/**
 * npm run build-igros -w @chassidushub-reader/igros-index -- --data <dir> [--out <dir>]
 *
 * <dir> is the source app's asset folder: `data.sqlite` (the letters),
 * `mini/<year>.json` (the maanos - unzip `miniletters.zip` into `mini/`
 * once) and `tags.json`. Writes, under --out (default: this package's
 * `data/`, which git ignores):
 *
 *   igros/vol-NN.json   {volume, letters}
 *   maanos/YYYY.json    {year, maanos}
 *   tags.json           [name, ...]
 *   index.json          counts per volume and year, and every source warning
 *
 * Gated content: nothing here may be released or packed until the rights
 * are cleared (see README.md).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lettersByVolume, readIgros } from '../src/readIgros.js';
import { readMaanos } from '../src/readMaanos.js';
import { readTags } from '../src/tags.js';
import type { SourceWarning } from '../src/types.js';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dataDir = flag('data');
if (!dataDir) {
  console.error('Usage: build-igros --data <asset dir> [--out <dir>]');
  process.exit(2);
}
const outDir = resolve(flag('out') ?? join(packageDir, 'data'));
const dbPath = join(dataDir, 'data.sqlite');
const miniDir = join(dataDir, 'mini');
const tagsPath = join(dataDir, 'tags.json');
if (!existsSync(dbPath)) {
  console.error(`No data.sqlite in ${dataDir}`);
  process.exit(1);
}
if (!existsSync(miniDir)) {
  console.error(`No mini/ in ${dataDir} - unzip the maanos once: unzip ${join(dataDir, 'miniletters.zip')} -d ${miniDir}`);
  process.exit(1);
}

const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
};

const igros = readIgros(dbPath);
const maanos = readMaanos(miniDir);
const tags = existsSync(tagsPath) ? readTags(tagsPath) : [];

rmSync(join(outDir, 'igros'), { recursive: true, force: true });
rmSync(join(outDir, 'maanos'), { recursive: true, force: true });
const volumes = lettersByVolume(igros.letters);
for (const [volume, letters] of volumes) {
  writeJson(join(outDir, 'igros', `vol-${String(volume).padStart(2, '0')}.json`), { volume, letters });
}
for (const [year, list] of maanos.byYear) {
  writeJson(join(outDir, 'maanos', `${year}.json`), { year, maanos: list });
}
writeJson(join(outDir, 'tags.json'), tags);

const warnings: SourceWarning[] = [...igros.warnings, ...maanos.warnings];
writeFileSync(
  join(outDir, 'index.json'),
  `${JSON.stringify(
    {
      igros: { letters: igros.letters.length, volumes: [...volumes].map(([volume, letters]) => ({ volume, letters: letters.length })) },
      maanos: { maanos: [...maanos.byYear.values()].reduce((sum, list) => sum + list.length, 0), years: [...maanos.byYear].map(([year, list]) => ({ year, maanos: list.length })) },
      tags: tags.length,
      warnings,
    },
    null,
    2,
  )}\n`,
);

const byKind = new Map<string, number>();
for (const warning of warnings) byKind.set(warning.kind, (byKind.get(warning.kind) ?? 0) + 1);
const maanosCount = [...maanos.byYear.values()].reduce((sum, list) => sum + list.length, 0);
console.log(`Igros: ${igros.letters.length} letters in ${volumes.size} volumes`);
console.log(`Maanos: ${maanosCount} in ${maanos.byYear.size} years (${[...maanos.byYear.keys()].join(', ')})`);
console.log(`Tags: ${tags.length}`);
console.log(`Source warnings: ${warnings.length}${byKind.size ? ` (${[...byKind].map(([kind, n]) => `${kind} ${n}`).join(', ')})` : ''} - listed in index.json`);
console.log(`Wrote ${outDir}`);
