import { gematriya } from '@hebcal/core';
import type { DownloadContentTypes } from '@sichos-kodesh/app-core';
import { ALL_CONTENT_TYPES, ESSENTIAL_CONTENT_TYPES } from '@sichos-kodesh/app-core';
import type { CatalogEntry, PdfEdition } from '@sichos-kodesh/catalog';
import { mafteiachMonthName, mafteiachMonthNameHebrew, mafteiachMonthToken } from '@sichos-kodesh/catalog';
import type { PackScope } from '@sichos-kodesh/pack-format';

/**
 * A pack's scope on the command line is a Hebrew year (`5736`) or a year
 * and mafteiach month token (`5736-01` is Tishrei, `5746-06B` Adar II).
 * It becomes the manifest's `scope`, the file name's slug and the filter
 * over the catalog's year file.
 */

export interface ParsedScope {
  scope: PackScope;
  year: number;
  /** mafteiach month token, for a month scope. */
  month?: string;
  /** The file-name stem: `5736-01-tishrei`, `5736`. */
  slug: string;
}

const SCOPE = /^(\d{4})(?:-(0[1-9]|1[0-2]|06[AB]))?$/;

export function parseScope(spec: string): ParsedScope {
  const match = SCOPE.exec(spec.trim());
  if (!match) throw new Error(`scope must be a Hebrew year (5736) or a year and month token (5736-01, 5746-06B), not "${spec}"`);
  const year = Number(match[1]);
  const yearHe = gematriya(year);
  const month = match[2];
  if (!month) {
    return { year, slug: String(year), scope: { kind: 'year', collection: 'farbrengens', hebrewYear: year, label: { en: String(year), he: yearHe } } };
  }
  const probe = `${year}-${month}-01`;
  const en = mafteiachMonthName(probe);
  const he = mafteiachMonthNameHebrew(probe);
  return {
    year,
    month,
    slug: `${year}-${month}-${en.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    scope: { kind: 'month', collection: 'farbrengens', hebrewYear: year, month, label: { en: `${en} ${year}`, he: `${he} ${yearHe}` } },
  };
}

/** The catalog entries a scope covers. */
export function entriesInScope(entries: CatalogEntry[], scope: ParsedScope): CatalogEntry[] {
  return entries.filter((entry) => entry.hebrewYear === scope.year && (!scope.month || mafteiachMonthToken(entry.hebrewDate) === scope.month));
}

const EDITIONS: readonly PdfEdition[] = ['sichosKodesh', 'sefer', 'torasMenachem'];
const FLAGS = ['audio', 'mugah', 'maamorim', 'hagahos', 'hosofos'] as const;

/**
 * `--sections`: the same content types the app's download settings use, so
 * a pack holds exactly what the phone would have downloaded.
 *
 *   essentials | everything          the two presets
 *   audio, mugah, maamorim, hagahos, hosofos
 *   biltiMugah                       every hanacha edition
 *   biltiMugah:sichosKodesh+torasMenachem   only those editions
 */
export function parseSections(spec: string): DownloadContentTypes {
  const types: DownloadContentTypes = { audio: false, hanachaEditions: [], mugah: false, maamorim: false, hagahos: false, hosofos: false };
  const addEditions = (editions: readonly PdfEdition[]) => {
    for (const edition of editions) if (!types.hanachaEditions.includes(edition)) types.hanachaEditions.push(edition);
  };
  for (const raw of spec.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    if (token === 'essentials' || token === 'everything') {
      const preset = token === 'essentials' ? ESSENTIAL_CONTENT_TYPES : ALL_CONTENT_TYPES;
      for (const flag of FLAGS) types[flag] ||= preset[flag];
      addEditions(preset.hanachaEditions);
      continue;
    }
    if ((FLAGS as readonly string[]).includes(token)) {
      types[token as (typeof FLAGS)[number]] = true;
      continue;
    }
    const [section, editionList] = token.split(':');
    if (section !== 'biltiMugah') throw new Error(`unknown section "${token}" (use essentials, everything, audio, biltiMugah[:editions], mugah, maamorim, hagahos, hosofos)`);
    if (editionList === undefined) {
      addEditions(EDITIONS);
      continue;
    }
    const editions = editionList.split('+').map((e) => e.trim());
    for (const edition of editions) {
      if (!(EDITIONS as readonly string[]).includes(edition)) throw new Error(`unknown hanacha edition "${edition}" (use ${EDITIONS.join(', ')})`);
    }
    addEditions(editions as PdfEdition[]);
  }
  if (!FLAGS.some((flag) => types[flag]) && types.hanachaEditions.length === 0) throw new Error('--sections selects nothing');
  return types;
}
