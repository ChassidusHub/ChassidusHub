import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IgrosLetter, Maaneh } from './types.js';

export interface IgrosOutput {
  /** Every letter, volume by volume in printed order. */
  letters: IgrosLetter[];
  /** Every maaneh, year by year in the source's order. */
  maanos: Maaneh[];
}

/** Reads what `build-igros` wrote (`igros/vol-NN.json`, `maanos/YYYY.json`) back in. */
export function readIgrosOutput(dir: string): IgrosOutput {
  const files = (sub: string, pattern: RegExp): string[] =>
    existsSync(join(dir, sub))
      ? readdirSync(join(dir, sub))
          .filter((name) => pattern.test(name))
          .sort()
          .map((name) => join(dir, sub, name))
      : [];
  const letters = files('igros', /^vol-\d+\.json$/).flatMap((file) => (JSON.parse(readFileSync(file, 'utf8')) as { letters: IgrosLetter[] }).letters);
  const maanos = files('maanos', /^\d{4}\.json$/).flatMap((file) => (JSON.parse(readFileSync(file, 'utf8')) as { maanos: Maaneh[] }).maanos);
  if (letters.length === 0 && maanos.length === 0) throw new Error(`No igros or maanos under ${dir} - run build-igros first`);
  return { letters, maanos };
}
