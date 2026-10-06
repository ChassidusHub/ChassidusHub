import type {
  CatalogAuthor,
  CatalogContentsEntry,
  CatalogContentsNode,
  CatalogEdition,
  CatalogNames,
  CatalogUnit,
  CatalogWork,
  CatalogWorkContents,
  CatalogWorksIndex,
  CatalogWorkSource,
} from '@sichos-kodesh/catalog';
import { unitsInOrder } from '@sichos-kodesh/catalog';
import { normalizeSearchText } from '../search/normalizeSearchText.js';
import type { Language } from '../search/language.js';

/**
 * The seforim (catalog schema 3) as both apps show them: the Rebbeim in
 * order, each with his seforim, then the works of many hands; a sefer's
 * contents, drilled into part by part; and which of a unit's editions the
 * reader shows.
 */

export function names(value: { he: string; en: string }, language: Language): string {
  return language === 'he' ? value.he : value.en;
}

export interface AuthorSection {
  author: CatalogAuthor | null;
  works: CatalogWork[];
}

/**
 * How a work can be opened:
 * - `read`: its units are in the catalog, and some edition may be read in the app;
 * - `collection`: its units are a library collection (Likkutei Sichos, the maamorim...);
 * - `links`: only its sources' own pages;
 * - `listed`: a name for now, nothing to open.
 */
export type WorkKind = 'read' | 'collection' | 'links' | 'listed';

export function mayRead(source: CatalogWorkSource | undefined): boolean {
  return source?.rights === 'ship' || source?.rights === 'ship-with-credit';
}

export function workKind(work: CatalogWork): WorkKind {
  if ((work.units ?? 0) > 0 && work.sources.some(mayRead)) return 'read';
  if (work.collection) return 'collection';
  if (work.sources.some((s) => s.source === 'sefaria' || s.source === 'hebrewbooks')) return 'links';
  return 'listed';
}

/** The Rebbeim (and their teachers) in the registry's order, each with his works; then the works with no author. Authors with no works are left out. */
export function authorSections(works: CatalogWorksIndex): AuthorSection[] {
  const sections: AuthorSection[] = works.authors.map((author) => ({ author, works: works.works.filter((w) => w.authors.includes(author.id)) }));
  const known = new Set(works.authors.map((a) => a.id));
  sections.push({ author: null, works: works.works.filter((w) => !w.authors.some((id) => known.has(id))) });
  return sections.filter((s) => s.works.length > 0);
}

/**
 * The works with a tile of their own on the home screen, beside the library
 * collections, and so not in the seforim browser: Igros Kodesh, and the
 * Maanos once they may ship (the works index holds them only then).
 */
export const HOME_WORK_IDS: readonly string[] = ['igros-kodesh-rebbe', 'maanos'];

/** The seforim browser's two shelves: what opens in the app (text, and the library's PDFs), and what opens on other sites. */
export type SeforimShelf = 'text' | 'links';

/** Whether a work is on a shelf of the seforim browser. Works with nothing to open, the home screen's own and the recordings are on neither. */
export function onShelf(work: CatalogWork, shelf: SeforimShelf): boolean {
  const kind = workKind(work);
  if (shelf === 'links') return kind === 'links';
  if (HOME_WORK_IDS.includes(work.id) || work.collection === 'jemEvents') return false;
  return kind === 'read' || kind === 'collection';
}

/**
 * One shelf of the seforim browser, by Rebbe in the registry's order, then
 * the works of many hands. On the links shelf an author with books on
 * HebrewBooks (`hasScans`) keeps his place even with no work of his own there.
 */
export function shelfSections(works: CatalogWorksIndex, shelf: SeforimShelf, hasScans: (authorId: string | null) => boolean = () => false): AuthorSection[] {
  const known = new Set(works.authors.map((a) => a.id));
  const sections: AuthorSection[] = [
    ...works.authors.map((author) => ({ author, works: works.works.filter((w) => w.authors.includes(author.id)) })),
    { author: null, works: works.works.filter((w) => !w.authors.some((id) => known.has(id))) },
  ];
  return sections
    .map((section) => ({ author: section.author, works: section.works.filter((w) => onShelf(w, shelf)) }))
    .filter((section) => section.works.length > 0 || (shelf === 'links' && hasScans(section.author?.id ?? null)));
}

/** How many units a contents entry holds, the parts below it included. */
export function unitCount(entry: CatalogContentsEntry): number {
  return 'unitId' in entry ? 1 : entry.entries.reduce((n, e) => n + unitCount(e), 0);
}

/** The part of the contents a path of indexes leads to: its entries and the titles on the way. Null when the path does not lead to a part. */
export function contentsAt(contents: CatalogWorkContents, path: readonly number[]): { entries: CatalogContentsEntry[]; trail: CatalogContentsNode[] } | null {
  let entries = contents.contents;
  const trail: CatalogContentsNode[] = [];
  for (const index of path) {
    const entry = entries[index];
    if (!entry || 'unitId' in entry) return null;
    trail.push(entry);
    entries = entry.entries;
  }
  return { entries, trail };
}

/** A unit's place: the previous and next units in reading order. */
export function neighbours(contents: CatalogWorkContents, unitId: string): { previous: CatalogUnit | null; next: CatalogUnit | null } {
  const ordered = unitsInOrder(contents);
  const at = ordered.findIndex((u) => u.id === unitId);
  if (at < 0) return { previous: null, next: null };
  return { previous: ordered[at - 1] ?? null, next: ordered[at + 1] ?? null };
}

/** Where a unit falls in the whole sefer, counted from 1 in reading order ("chapter 3 of 53"), or null. */
export function unitPosition(contents: CatalogWorkContents, unitId: string): { number: number; total: number } | null {
  const ordered = unitsInOrder(contents);
  const at = ordered.findIndex((u) => u.id === unitId);
  return at < 0 ? null : { number: at + 1, total: ordered.length };
}

/** Whether a work's units are letters (the Igros): the apps count and name them as letters, not chapters. */
export function unitsAreLetters(work: Pick<CatalogWork, 'levels'>): boolean {
  return work.levels.at(-1) === 'letter';
}

/** The part of the sefer a unit is in, by its title (a volume of the Igros: `חלק א`), or null for a unit at the top. */
export function unitPart(contents: CatalogWorkContents, unitId: string): CatalogNames | null {
  const path = pathToUnit(contents, unitId);
  const node = path.length > 0 ? contents.contents[path[0]!] : undefined;
  return node && !('unitId' in node) ? node.title : null;
}

/**
 * A passage as the reader shares it: its words, then the sefer and the
 * unit it is from (in the passage's own language), then where to read it.
 */
export function citation(passage: string, work: CatalogWork, unit: CatalogUnit, language: Language, url?: string | null): string {
  const label = language === 'en' ? (unit.labelEn ?? unit.label) : unit.label;
  return `${passage.trim()}\n\n— ${names(work.title, language)}, ${label}${url ? `\n${url}` : ''}`;
}

/** The contents path (indexes) that leads to the part holding a unit, so "up" from the reader lands where the unit is listed. */
export function pathToUnit(contents: CatalogWorkContents, unitId: string): number[] {
  const walk = (entries: readonly CatalogContentsEntry[], path: number[]): number[] | null => {
    for (const [index, entry] of entries.entries()) {
      if ('unitId' in entry) {
        if (entry.unitId === unitId) return path;
      } else {
        const found = walk(entry.entries, [...path, index]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(contents.contents, []) ?? [];
}

/** The editions the reader can show (their source may ship), in the catalog's order. */
export function readableEditions(work: CatalogWork, unit: CatalogUnit): CatalogEdition[] {
  return unit.editions.filter((e) => mayRead(work.sources[e.source]));
}

/** The editions only their source's page can show. */
export function linkEditions(work: CatalogWork, unit: CatalogUnit): CatalogEdition[] {
  return unit.editions.filter((e) => !mayRead(work.sources[e.source]));
}

/**
 * Which edition the reader opens: the one asked for when the unit has it,
 * else the source the reader chose for this work last time, else the
 * original Hebrew, else the first it can show.
 */
export function chooseEdition(work: CatalogWork, unit: CatalogUnit, asked?: number | null, remembered?: number | null): CatalogEdition | null {
  const readable = readableEditions(work, unit);
  const bySource = (source: number | null | undefined) => (source === null || source === undefined ? undefined : readable.find((e) => e.source === source));
  return bySource(asked) ?? bySource(remembered) ?? readable.find((e) => work.sources[e.source]?.language === 'he') ?? readable[0] ?? null;
}

/** A short name for an edition's source, for the switcher: "Hebrew", or "English (Kehot)" when two editions share a language. */
export function editionLabel(source: CatalogWorkSource, languageNames: Record<'he' | 'en' | 'yi', string>, sameLanguageCount: number): string {
  const lang = languageNames[source.language ?? 'he'];
  if (sameLanguageCount <= 1 || !source.version) return lang;
  const short = source.version.replace(/\s*\(.*\)\s*$/, '').replace(/ Publication Society$/, '').replace(/^Sefaria /, '').replace(/ - Kehot$/, '');
  return `${lang} (${short})`;
}

/**
 * A search result's snippet: the words around the first query word in the
 * text, cut at word boundaries, with the matched word found the way the
 * index finds it (niqqud and punctuation ignored, from the word's start).
 */
export function snippetAround(text: string, query: string, radius = 70): string | null {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (words.length === 0) return null;
  // Walk the text word by word, comparing each word's normalised form.
  const tokens = [...text.matchAll(/\S+/g)];
  let hit = -1;
  for (const [i, token] of tokens.entries()) {
    const normal = normalizeSearchText(token[0]).split(' ');
    if (normal.some((w) => words.some((q) => w.startsWith(q) || (w.length > q.length && w.slice(1).startsWith(q)) || (w.length > q.length + 1 && w.slice(2).startsWith(q))))) {
      hit = i;
      break;
    }
  }
  if (hit < 0) return null;
  const at = tokens[hit]!.index!;
  let start = Math.max(0, at - radius);
  let end = Math.min(text.length, at + tokens[hit]![0].length + radius);
  if (start > 0) start = text.indexOf(' ', start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(' ', end) > at ? text.lastIndexOf(' ', end) : end;
  return `${start > 0 ? '… ' : ''}${text.slice(start, end).trim()}${end < text.length ? ' …' : ''}`;
}
