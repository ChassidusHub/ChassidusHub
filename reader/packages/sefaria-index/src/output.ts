import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImportedWork } from '@chassidushub-reader/works';
import { editionKey, type WorkImport } from './importWork.js';

/**
 * The import's output, one folder per work:
 *
 *     <out>/<work id>/work.json                       the units, editions and contents
 *     <out>/<work id>/text/<unit id>@<edition>.html   each kept text
 *
 * A unit id can hold slashes (`part1/1`), so the text files sit in folders
 * like it. A work is written to a temporary folder and swapped in whole, so
 * a text that is no longer there does not linger.
 */

export function textPath(outDir: string, workId: string, unitId: string, key: string): string {
  return path.join(outDir, workId, 'text', `${unitId}@${key}.html`);
}

export async function writeWorkImport(outDir: string, result: WorkImport): Promise<void> {
  const { workId } = result.work;
  const final = path.join(outDir, workId);
  const staging = path.join(outDir, `.${workId}.partial`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await writeFile(path.join(staging, 'work.json'), `${JSON.stringify(result.work, null, 1)}\n`);
  for (const [key, html] of result.texts) {
    const at = key.lastIndexOf('@');
    const file = textPath(path.dirname(staging), path.basename(staging), key.slice(0, at), key.slice(at + 1));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html);
  }
  await rm(final, { recursive: true, force: true });
  await rename(staging, final);
}

export interface ImportedText {
  workId: string;
  unitId: string;
  key: string;
  label: string;
  html: string;
}

/** One imported work, with each kept text, for whoever stores or packs them (`sk-archive import-text`). */
export async function readWorkImport(outDir: string, workId: string): Promise<{ work: ImportedWork; texts: ImportedText[] }> {
  const work = JSON.parse(await readFile(path.join(outDir, workId, 'work.json'), 'utf8')) as ImportedWork;
  const texts: ImportedText[] = [];
  for (const unit of work.units) {
    for (const edition of unit.editions) {
      if (!edition.text) continue;
      const key = editionKey(edition);
      const html = await readFile(textPath(outDir, workId, unit.id, key), 'utf8');
      texts.push({ workId, unitId: unit.id, key, label: edition.language === 'en' ? (unit.labelEn ?? unit.label) : unit.label, html });
    }
  }
  return { work, texts };
}
