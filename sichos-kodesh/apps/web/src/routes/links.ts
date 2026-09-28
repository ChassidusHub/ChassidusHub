import { farbrengensPath } from './tabs';

/**
 * One address per farbrengen (docs: the UI/UX redo plan, "Structure"):
 * `/f/<year>/<occasion>`, with its PDFs under it. How the page was reached
 * changes only where Back goes, never the address - so a shared link, a
 * search result and the week's list all open the same page.
 *
 * Every older address still works: the four route families a farbrengen
 * used to live under (the week, a year, every year's week, one occasion
 * every year) and their recordings, category and PDF pages all lead to the
 * new one (`canonicalFarbrengenPath`, and its test keeps the list).
 */

export function farbrengenPath(hebrewYear: number, occasionId: number): string {
  return `/f/${hebrewYear}/${occasionId}`;
}

export function farbrengenPdfPath(hebrewYear: number, occasionId: number, driveFileId: string): string {
  return `${farbrengenPath(hebrewYear, occasionId)}/pdf/${encodeURIComponent(driveFileId)}`;
}

/** The farbrengen page's sections, as anchors on its address. */
export const FARBRENGEN_AUDIO_ANCHOR = 'audio';
export const FARBRENGEN_TEXTS_ANCHOR = 'texts';

const OLD_FAMILIES: readonly RegExp[] = [
  /^\/follow\/(\d+)\/(\d+)(\/.*)?$/,
  /^\/browse\/(\d+)\/(\d+)(\/.*)?$/,
  /^\/this-week-all-years\/(\d+)\/(\d+)(\/.*)?$/,
  /^\/occasion-all-years\/\d+\/\d+\/(\d+)\/(\d+)(\/.*)?$/,
];

/** An old farbrengen address's new one, or `null` for an address that is not one. */
export function canonicalFarbrengenPath(pathname: string): string | null {
  for (const family of OLD_FAMILIES) {
    const match = family.exec(pathname);
    if (!match) continue;
    const base = farbrengenPath(Number(match[1]), Number(match[2]));
    const rest = match[3] ?? '';
    if (rest === '' || rest === '/') return base;
    if (rest === '/recordings') return `${base}#${FARBRENGEN_AUDIO_ANCHOR}`;
    if (/^\/category\/[^/]+$/.test(rest)) return `${base}#${FARBRENGEN_TEXTS_ANCHOR}`;
    if (/^\/pdf\/[^/]+$/.test(rest)) return `${base}${rest}`;
    return null;
  }
  return null;
}

/**
 * The library's addresses, the same way: `/library` is the tab's shelf,
 * `/l/<collection>` a collection of it, down to `/l/<collection>/<item>`
 * for one sicha, maamar, yoman...; `/s/<sefer>` a sefer, down to one of its
 * parts (`/s/igros-kodesh-rebbe/12`, counted from 1) and `/s/<sefer>/read`
 * for the reader; `/s/by/<rebbe>` the seforim of one Rebbe. The farbrengens
 * of one moed or parsha live on their own tab, under `/farbrengens`.
 *
 * The addresses before them (`/library/c/...`, `/library/item/...`,
 * `/seforim/...`) lead here (`canonicalLibraryPath`, with its test).
 */

export function libraryCollectionPath(collection: string, axis?: string): string {
  return `/l/${collection}${axis ? `?axis=${encodeURIComponent(axis)}` : ''}`;
}

export function libraryGroupPath(collection: string, axis: string, slug: string, section?: string): string {
  return `/l/${collection}/${encodeURIComponent(axis)}/${encodeURIComponent(slug)}${section !== undefined ? `?section=${encodeURIComponent(section)}` : ''}`;
}

export function libraryItemPath(collection: string, id: string): string {
  return `/l/${collection}/${encodeURIComponent(id)}`;
}

export function libraryItemPdfPath(collection: string, id: string, driveFileId: string): string {
  return `${libraryItemPath(collection, id)}/pdf/${encodeURIComponent(driveFileId)}`;
}

/** A sefer's page, opened on one part of its contents: `path` indexes into the tree from 0, the address counts from 1. */
export function seferPath(workId: string, path: readonly number[] = []): string {
  return `/s/${encodeURIComponent(workId)}${path.map((index) => `/${index + 1}`).join('')}`;
}

/** The part of a sefer's contents an address's segments name (`['12', '3']` -> `[11, 2]`), or `null` when one is not a count from 1. */
export function seferPathIndexes(segments: readonly string[]): number[] | null {
  const indexes = segments.filter((s) => s !== '').map((s) => (/^[1-9]\d*$/.test(s) ? Number(s) - 1 : NaN));
  return indexes.every((i) => Number.isInteger(i)) ? indexes : null;
}

/** Where a unit opens in the reader. Unit ids hold slashes (`part1/1`), so the unit and edition ride in the query. */
export function readerPath(workId: string, unitId: string, source?: number): string {
  const query = new URLSearchParams({ unit: unitId });
  if (source !== undefined) query.set('source', String(source));
  return `/s/${encodeURIComponent(workId)}/read?${query.toString()}`;
}

/** One Rebbe's seforim (`null`: the seforim of many hands). */
export function rebbePath(authorId: string | null): string {
  return `/s/by/${encodeURIComponent(authorId ?? 'others')}`;
}

/** An author's books on HebrewBooks (`null`: the other Chabad books), or one series of them (its index in that list). */
export function scansPath(authorId: string | null, series?: number): string {
  return `/s/hebrewbooks/${encodeURIComponent(authorId ?? 'others')}${series !== undefined ? `?series=${series}` : ''}`;
}

/** Every farbrengen mafteiach lists for one moed or parsha. */
export function occasionGroupPath(axis: 'moadim' | 'parshiyos', slug: string): string {
  return `/farbrengens/${axis === 'moadim' ? 'moed' : 'parsha'}/${encodeURIComponent(slug)}`;
}

/** An old library or seforim address's new one (with its query), or `null` for an address that is not one. */
export function canonicalLibraryPath(pathname: string, search = ''): string | null {
  const query = new URLSearchParams(search);
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [root, kind, ...rest] = segments;
  if (root === 'library') {
    if (kind === 'c' && rest.length === 1) return libraryCollectionPath(rest[0]!, query.get('axis') ?? undefined);
    if (kind === 'c' && rest.length === 3) return libraryGroupPath(rest[0]!, rest[1]!, rest[2]!, query.get('section') ?? undefined);
    if (kind === 'item' && rest.length >= 2) {
      const [collection, id, view, file] = rest as [string, string, string?, string?];
      if (rest.length === 2) return libraryItemPath(collection, id);
      if (rest.length === 3 && view === 'recordings') return `${libraryItemPath(collection, id)}#${FARBRENGEN_AUDIO_ANCHOR}`;
      if (rest.length === 4 && view === 'pdf') return libraryItemPdfPath(collection, id, file!);
      return null;
    }
    if ((kind === 'moadim' || kind === 'parshiyos') && rest.length === 1) return occasionGroupPath(kind, rest[0]!);
    if ((kind === 'moadim' || kind === 'parshiyos') && rest.length === 0) return farbrengensPath(kind === 'moadim' ? 'moed' : 'parsha');
    return null;
  }
  if (root === 'seforim') {
    if (kind === undefined) return '/library';
    if (kind === 'search' && rest.length === 0) return '/search?in=seforim';
    if (kind === 'hebrewbooks' && rest.length === 1) {
      const series = query.get('series');
      return scansPath(rest[0] === 'others' ? null : rest[0]!, series !== null && /^\d+$/.test(series) ? Number(series) : undefined);
    }
    if (rest.length === 0) {
      const path = (query.get('path') ?? '').split('.').filter((s) => /^\d+$/.test(s)).map(Number);
      return seferPath(kind, path);
    }
    if (rest.length === 1 && rest[0] === 'read') return `/s/${encodeURIComponent(kind)}/read${search.startsWith('?') || search === '' ? search : `?${search}`}`;
    return null;
  }
  return null;
}
