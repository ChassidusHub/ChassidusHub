import { gematriya } from '@hebcal/core';
import type { DownloadContentTypes } from '@sichos-kodesh/app-core';
import { ALL_CONTENT_TYPES, ESSENTIAL_CONTENT_TYPES } from '@sichos-kodesh/app-core';
import type { CatalogEntry, PdfEdition } from '@sichos-kodesh/catalog';
import { mafteiachMonthName, mafteiachMonthNameHebrew, mafteiachMonthToken } from '@sichos-kodesh/catalog';
import type { PackScope } from './manifest.js';

/**
 * A pack's scope (`sk-pack build --scope`, the pack API's `?scope=`) is a
 * Hebrew year (`5736`) or a year and mafteiach month token (`5736-01` is
 * Tishrei, `5746-06B` Adar II).
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

/**
 * Several years or months in one pack: `5736,5740` or `5736-01,5740-01`
 * (the download site sends the same months for every year picked). Each
 * token reads as parseScope; repeats are dropped, and the list is in year
 * then month order.
 */
export function parseScopeList(spec: string): ParsedScope[] {
  const tokens = spec
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) throw new Error('scope is empty');
  const seen = new Map<string, ParsedScope>();
  for (const token of tokens) {
    const parsed = parseScope(token);
    seen.set(parsed.slug, parsed);
  }
  return [...seen.values()].sort((a, b) => a.year - b.year || (a.month ?? '').localeCompare(b.month ?? ''));
}

/** One scope and file stem for a list: the scope itself when there is one, else "Tishrei, 5736-5752" as a custom scope. */
export function describeScopeList(scopes: ParsedScope[]): { scope: PackScope; slug: string } {
  if (scopes.length === 1) return { scope: scopes[0]!.scope, slug: scopes[0]!.slug };
  const years = [...new Set(scopes.map((s) => s.year))].sort((a, b) => a - b);
  const wholeYears = scopes.every((s) => !s.month);
  const monthNames = { he: [] as string[], en: [] as string[] };
  if (!wholeYears) {
    for (const s of scopes) {
      if (!s.month) continue;
      const probe = `${s.year}-${s.month}-01`;
      const he = mafteiachMonthNameHebrew(probe);
      const en = mafteiachMonthName(probe);
      if (!monthNames.he.includes(he)) monthNames.he.push(he);
      if (!monthNames.en.includes(en)) monthNames.en.push(en);
    }
  }
  const contiguous = years.every((year, i) => i === 0 || year === years[i - 1]! + 1);
  const yearsLabel =
    years.length === 1
      ? { he: gematriya(years[0]!), en: String(years[0]) }
      : contiguous
        ? { he: `${gematriya(years[0]!)}–${gematriya(years[years.length - 1]!)}`, en: `${years[0]}-${years[years.length - 1]}` }
        : years.length <= 4
          ? { he: years.map((y) => gematriya(y)).join(', '), en: years.join(', ') }
          : { he: `${years.length} שנים`, en: `${years.length} years` };
  const label = wholeYears
    ? yearsLabel
    : { he: `${monthNames.he.join(', ')} ${yearsLabel.he}`, en: `${monthNames.en.join(', ')} ${yearsLabel.en}` };
  const monthsSlug = wholeYears ? '' : `-${monthNames.en.length <= 3 ? monthNames.en.map((m) => m.toLowerCase().replace(/[^a-z0-9]+/g, '-')).join('-') : `${monthNames.en.length}-months`}`;
  const yearsSlug = years.length === 1 ? String(years[0]) : contiguous ? `${years[0]}-${years[years.length - 1]}` : `${years.length}-years-${years[0]}-${years[years.length - 1]}`;
  return { scope: { kind: 'custom', collection: 'farbrengens', label }, slug: `${yearsSlug}${monthsSlug}` };
}

/** The catalog entries a scope covers. */
export function entriesInScope(entries: CatalogEntry[], scope: ParsedScope): CatalogEntry[] {
  return entries.filter((entry) => entry.hebrewYear === scope.year && (!scope.month || mafteiachMonthToken(entry.hebrewDate) === scope.month));
}

/** The catalog entries any of the scopes covers (a year's list: its whole year, or its months). */
export function entriesInScopes(entries: CatalogEntry[], scopes: ParsedScope[]): CatalogEntry[] {
  return entries.filter((entry) => scopes.some((scope) => entry.hebrewYear === scope.year && (!scope.month || mafteiachMonthToken(entry.hebrewDate) === scope.month)));
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
