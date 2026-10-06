import { createHash } from 'node:crypto';
import { hebrewNumeral, letterHtml } from './textObjects.js';
import type { IgrosLetter } from './types.js';

/**
 * The Igros Kodesh as a readable sefer: what packages/works takes from an
 * importer (its `ImportedWork`), and the text objects the catalog API
 * hosts. Each letter is a unit; the volumes are the contents.
 */

export const IGROS_WORK_ID = 'igros-kodesh-rebbe';

/** The shape of packages/works' ImportedWork, as written to `work.json` (kept here so this package needs no dependency). */
export interface IgrosImportedWork {
  workId: string;
  source: 'igros-app';
  contents: Array<{ title: { he: string; en: string }; entries: Array<{ unitId: string }> }>;
  units: Array<{
    id: string;
    workId: string;
    label: string;
    labelEn: string;
    hebrewYear?: number;
    editions: Array<{ source: 'igros-app'; sourceId: string; kind: 'text'; licence: 'commercial'; language: 'he'; text: { sha256: string; bytes: number } }>;
  }>;
}

/** One volume's text objects, as the catalog API's build reads them. */
export interface IgrosTextBundle {
  volume: number;
  texts: string[];
}

/** A letter's unit id within the work: its id without the collection (`3275`, `141a`). */
export function letterUnitId(letter: IgrosLetter): string {
  return letter.id.replace(/^igros:/, '');
}

export function igrosImport(letters: readonly IgrosLetter[]): { work: IgrosImportedWork; bundles: IgrosTextBundle[] } {
  const work: IgrosImportedWork = { workId: IGROS_WORK_ID, source: 'igros-app', contents: [], units: [] };
  const bundles: IgrosTextBundle[] = [];
  for (const letter of letters) {
    const html = letterHtml(letter);
    const sha256 = createHash('sha256').update(html, 'utf8').digest('hex');
    const bytes = Buffer.byteLength(html, 'utf8');
    const unitId = letterUnitId(letter);
    let bundle = bundles.at(-1);
    if (bundle?.volume !== letter.volume) {
      bundle = { volume: letter.volume, texts: [] };
      bundles.push(bundle);
      work.contents.push({ title: { he: `חלק ${hebrewNumeral(letter.volume)}`, en: `Volume ${letter.volume}` }, entries: [] });
    }
    bundle.texts.push(html);
    work.contents.at(-1)!.entries.push({ unitId });
    work.units.push({
      id: unitId,
      workId: IGROS_WORK_ID,
      label: `אגרת ${letter.numberLabel}`,
      labelEn: `Letter ${letter.number}${letter.suffix}`,
      ...(letter.hebrewYear ? { hebrewYear: letter.hebrewYear } : {}),
      editions: [{ source: 'igros-app', sourceId: letter.id, kind: 'text', licence: 'commercial', language: 'he', text: { sha256, bytes } }],
    });
  }
  return { work, bundles };
}
