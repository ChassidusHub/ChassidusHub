/**
 * npm run import-igros -w @chassidushub-reader/igros-index -- [--from <dir>] [--import <dir>] [--texts <dir>]
 *
 * Makes the Igros Kodesh a readable sefer, from build-igros' output
 * (--from, default this package's `data/`):
 *
 *   --import  <dir>/igros-kodesh-rebbe/work.json - the work, its volumes and
 *             letters, each letter's text object named by sha256 - for
 *             packages/works' build-catalog-works (--imports <dir>).
 *             Default: this package's `import/`, which git ignores.
 *   --texts   <dir>/vol-NN.json - each volume's text objects, which the
 *             catalog API serves at their sha256 (services/catalog-api).
 *             Default: services/catalog-api/texts/igros-kodesh-rebbe.
 *
 * The Igros ship (cleared by Shmuly, 2026-09-24: packages/catalog's
 * SHIPPABLE_COLLECTIONS); the Maanos stay local, and nothing here reads them.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IGROS_WORK_ID, igrosImport } from '../src/importWork.js';
import { readIgrosOutput } from '../src/readOutput.js';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageDir, '..', '..');

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const fromDir = resolve(flag('from') ?? join(packageDir, 'data'));
const importDir = resolve(flag('import') ?? join(packageDir, 'import'));
const textsDir = resolve(flag('texts') ?? join(repoRoot, 'services', 'catalog-api', 'texts', IGROS_WORK_ID));

const { letters } = readIgrosOutput(fromDir);
const { work, bundles } = igrosImport(letters);

const workDir = join(importDir, IGROS_WORK_ID);
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });
writeFileSync(join(workDir, 'work.json'), `${JSON.stringify(work)}\n`);

rmSync(textsDir, { recursive: true, force: true });
mkdirSync(textsDir, { recursive: true });
for (const bundle of bundles) writeFileSync(join(textsDir, `vol-${String(bundle.volume).padStart(2, '0')}.json`), `${JSON.stringify(bundle)}\n`);

const bytes = work.units.reduce((sum, unit) => sum + unit.editions[0]!.text.bytes, 0);
console.log(`Igros Kodesh: ${work.units.length} letters in ${bundles.length} volumes, ${(bytes / 1e6).toFixed(1)} MB of text`);
console.log(`Wrote ${join(workDir, 'work.json')} and ${bundles.length} text bundles in ${textsDir}`);
