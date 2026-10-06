import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanHtml, htmlToText } from './cleanHtml.js';
import type { Maaneh, SourceWarning } from './types.js';

interface RawMaaneh {
  hebnum?: unknown;
  hebdate?: unknown;
  text?: unknown;
  engnum?: unknown;
  year?: unknown;
}

export interface ReadMaanosResult {
  /** Year -> its maanos in the file's order. */
  byYear: Map<number, Maaneh[]>;
  warnings: SourceWarning[];
}

/**
 * The maanos from a directory of `<year>.json` files (the source ships them
 * zipped as `miniletters.zip`; unzip it once into `mini/`). Each file is an
 * array of `{hebnum, hebdate, text, engnum, year}`.
 */
export function readMaanos(dir: string): ReadMaanosResult {
  const byYear = new Map<number, Maaneh[]>();
  const warnings: SourceWarning[] = [];
  const files = readdirSync(dir)
    .filter((name) => /^\d{4}\.json$/.test(name))
    .sort();
  for (const file of files) {
    const fileYear = Number(file.slice(0, 4));
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown;
    if (!Array.isArray(raw)) {
      warnings.push({ kind: 'bad-entry', where: file, detail: 'not an array; skipped' });
      continue;
    }
    const list: Maaneh[] = [];
    const seen = new Set<string>();
    raw.forEach((entry: RawMaaneh, index) => {
      const where = `${file}[${index}]`;
      const number = Number(entry?.engnum);
      if (!Number.isInteger(number) || number < 1) {
        warnings.push({ kind: 'no-number', where, detail: `engnum ${JSON.stringify(entry?.engnum)}; skipped` });
        return;
      }
      const year = Number(entry.year ?? fileYear);
      if (year !== fileYear) {
        warnings.push({ kind: 'bad-entry', where, detail: `year ${year} in the ${fileYear} file; filed under ${fileYear}` });
      }
      let id = `maanos:${fileYear}:${number}`;
      if (seen.has(id)) {
        let n = 2;
        while (seen.has(`${id}-${n}`)) n += 1;
        warnings.push({ kind: 'duplicate-id', where, detail: `${id} already taken; this one is ${id}-${n}` });
        id = `${id}-${n}`;
      }
      seen.add(id);
      list.push({
        id,
        year: fileYear,
        number,
        numberLabel: htmlToText(String(entry.hebnum ?? '')),
        dateLine: htmlToText(String(entry.hebdate ?? '')).replace(/\n/g, ' '),
        body: cleanHtml(String(entry.text ?? '')),
      });
    });
    byYear.set(fileYear, list);
  }
  return { byYear, warnings };
}
