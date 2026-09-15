import Fuse from 'fuse.js';
import {
  CHAG_CATEGORIES,
  isHighlightedFarbrengenHanacha,
  mafteiachDay,
  mafteiachMonthToken,
  mafteiachMonthTokenToHDateMonth,
  occasionChagCategory,
  occasionParsha,
  occasionSpecialDay,
} from '@sichos-kodesh/catalog';
import type { CatalogByYear, CatalogEntry, ChagCategory, PdfSection } from '@sichos-kodesh/catalog';
import { IL } from '../config';
import { parseSmartQuery } from './parseSmartQuery';

/** "hanacha" is the highlighted Sichos Kodesh/Toras Menachem transcript specifically (see isHighlightedFarbrengenHanacha) - a meaningful search target in its own right, distinct from bilti mugah generally. */
export type ContentType = 'audio' | 'hanacha' | PdfSection;

const CHAG_CATEGORY_SET: ReadonlySet<string> = new Set(CHAG_CATEGORIES);

/** Exported so SearchScreen can tell which of the two split dropdowns (parsha vs. chag) a stored `filters.parsha` value belongs to - both write into that one field (see its own doc comment). */
export function isChagCategory(value: string): value is ChagCategory {
  return CHAG_CATEGORY_SET.has(value);
}

export interface SearchFilters {
  query: string;
  hebrewYear: number | null;
  /** HDate-native month number (1=Nisan...13=Adar II - see MAFTEIACH_MONTH_OPTIONS), not the raw per-year token: a plain year's "06" and a leap year's "06A" are the same real month and both need to match a single "Adar" choice. */
  hdateMonth: number | null;
  /** Hebrew day-of-month (1-30), independent of `hdateMonth` - either can be set alone or together to pin an exact date. */
  day: number | null;
  /** Either a `@hebcal/core` `parshiot` entry (e.g. "Beshalach") or a `ChagCategory` (e.g. "Sukkot") - one dropdown, since picking a specific week's reading and picking a specific chag are the same kind of question ("which occasion in the calendar"), just resolved differently (see occasionParsha vs occasionChagCategory in searchOccasions below). */
  parsha: string | null;
  /** A `SpecialDay` id (see occasionSpecialDay) - its own field, not folded into `parsha`, since a special day and a parsha/chag aren't mutually exclusive the way parsha and chag are (a special day can fall on an otherwise-ordinary weekday with its own parsha). */
  specialDay: string | null;
  /** OR'd together - an entry matches if it has *any* of the selected types; empty means no type filter. */
  types: ContentType[];
}

export const EMPTY_FILTERS: SearchFilters = { query: '', hebrewYear: null, hdateMonth: null, day: null, parsha: null, specialDay: null, types: [] };

export interface SearchResultGroup {
  hebrewYear: number;
  entries: CatalogEntry[];
}

/**
 * Strips every quote/apostrophe-like character before comparing - the same
 * Hebrew abbreviation mark (e.g. the ' in ר"ד or the ' in יו"ד) can show up
 * as a straight ASCII quote, a "smart"/curly quote picked up from a
 * copy-pasted source, or the proper Hebrew gershayim/geresh, depending on
 * where the text came from - a search shouldn't fail just because the query
 * and the label happen to use different forms of it. Also strips niqud
 * (Hebrew vowel/cantillation points, U+0591-05C7) for the same reason - a
 * transcribed label may or may not carry them, independent of the word
 * itself - and collapses whitespace so an extra/missing space doesn't
 * matter either.
 */
export function normalize(text: string): string {
  return text
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'‘’“”״׳`´]/g, '')
    .replace(/[!^$|=]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface IndexedEntry {
  entry: CatalogEntry;
  label: string;
}

/**
 * Fuse.js gives free-text search real typo tolerance (a transposed or
 * missing letter, e.g. "בשלך" for "בשלח", still finds the right occasion)
 * and match-anywhere/any-order behavior (a multi-word query doesn't need to
 * appear as one contiguous substring) - a plain `.includes()` check can't
 * do either. Built lazily and cached by catalog object identity - the
 * bundled catalog never changes at runtime, so this pays the
 * index-building cost once no matter how many searches follow, the same
 * "index only what a filter actually needs" spirit as `occasionParsha`'s
 * own per-year caching below.
 */
let cachedCatalog: CatalogByYear | null = null;
let cachedFuse: Fuse<IndexedEntry> | null = null;

function getFuseIndex(catalog: CatalogByYear): Fuse<IndexedEntry> {
  if (cachedFuse && cachedCatalog === catalog) return cachedFuse;
  const items: IndexedEntry[] = [];
  for (const year of Object.keys(catalog).map(Number)) {
    for (const entry of catalog[year] ?? []) {
      items.push({ entry, label: normalize(entry.occasionLabel) });
    }
  }
  cachedFuse = new Fuse(items, {
    keys: ['label'],
    // 0.3 balances typo tolerance against false positives: much looser and
    // short, similarly-worded Hebrew labels start cross-matching (e.g.
    // "יחידות", an unrelated occasion type, fuzzy-matches "יו"ד שבט"),
    // while this threshold still tolerates a genuine missing letter in a
    // longer word (e.g. "פורם קטן" still finds "פורים קטן"). Short (2-3
    // letter) Hebrew words don't get much typo tolerance at this
    // threshold - a single wrong letter is already a large fraction of the
    // word - but that's an inherent tradeoff of Hebrew's short roots, not
    // something a looser threshold fixes without reintroducing false
    // positives.
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
    // Without this, Fuse treats the whole query as one pattern fuzzy-matched
    // against the whole label: a label like "יום ג' פרשת בשלח" wouldn't
    // match a query typed as "בשלח פרשת" (right words, different order) at
    // all, since that's a very different string overall even though every
    // word is present. With it on, whitespace-separated words in the
    // (already-normalized, so no stray Fuse operator characters survive to
    // be misread) query become independent fuzzy sub-patterns ANDed
    // together - each word can appear anywhere, in any order, and still be
    // typo-tolerant on its own.
    useExtendedSearch: true,
  });
  cachedCatalog = catalog;
  return cachedFuse;
}

function entryHasType(entry: CatalogEntry, type: ContentType): boolean {
  if (type === 'audio') return entry.audio.length > 0;
  if (type === 'hanacha') return entry.pdfs.some(isHighlightedFarbrengenHanacha);
  return entry.pdfs.some((pdf) => pdf.section === type);
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.hebrewYear != null ||
    filters.hdateMonth != null ||
    filters.day != null ||
    filters.parsha != null ||
    filters.specialDay != null ||
    filters.types.length > 0
  );
}

/**
 * Scans the whole bundled catalog - a few thousand occasions, cheap enough
 * to filter synchronously on every keystroke/filter change; the structured
 * filters below (year/month/day/parsha/type) run directly against each
 * entry with no index needed, and the free-text query defers to
 * `getFuseIndex` above (built once, then reused) rather than paying for a
 * fresh index on every keystroke. `occasionParsha` only runs (and only then
 * pays for building a year's `Sedra`) when the parsha filter is actually
 * set, and caches that per year internally, so leaving it off costs
 * nothing.
 */
export function searchOccasions(catalog: CatalogByYear, filters: SearchFilters): SearchResultGroup[] {
  if (!hasActiveFilters(filters)) return [];
  const years = Object.keys(catalog)
    .map(Number)
    .sort((a, b) => a - b);

  // The free-text box doubles as a "smart" search: a typed year, month,
  // day, parsha or chag name is pulled out of it here and treated exactly
  // like its own dropdown filter would be (see parseSmartQuery's own doc
  // comment) - an explicit dropdown selection still wins over whatever the
  // text also happens to mention, rather than fighting it. Only the text
  // left over after that goes to Fuse for fuzzy label matching.
  const { detected, remainingText } = parseSmartQuery(filters.query, { min: years[0] ?? 0, max: years[years.length - 1] ?? 0 });
  const effectiveYear = filters.hebrewYear ?? detected.hebrewYear;
  const effectiveMonth = filters.hdateMonth ?? detected.hdateMonth;
  const effectiveDay = filters.day ?? detected.day;
  const effectiveParsha = filters.parsha ?? detected.parsha;

  // Computed once per call, not per entry - `fuse.search()` itself does the
  // whole-index scan, so running it inside the per-entry filter below would
  // repeat that scan once per entry instead of once total.
  const matchedEntries = remainingText ? new Set(getFuseIndex(catalog).search(remainingText).map((result) => result.item.entry)) : null;
  const results: SearchResultGroup[] = [];

  for (const year of years) {
    if (effectiveYear != null && year !== effectiveYear) continue;
    const entries = (catalog[year] ?? []).filter((entry) => {
      if (entry.audio.length === 0 && entry.pdfs.length === 0) return false;
      if (matchedEntries && !matchedEntries.has(entry)) return false;
      if (effectiveMonth != null && mafteiachMonthTokenToHDateMonth(mafteiachMonthToken(entry.hebrewDate)) !== effectiveMonth) return false;
      if (effectiveDay != null && mafteiachDay(entry.hebrewDate) !== effectiveDay) return false;
      if (effectiveParsha) {
        if (isChagCategory(effectiveParsha)) {
          if (occasionChagCategory(entry.hebrewDate, IL) !== effectiveParsha) return false;
        } else {
          const parsha = occasionParsha(entry.hebrewDate, IL);
          if (!parsha || !parsha.includes(effectiveParsha)) return false;
        }
      }
      if (filters.specialDay && occasionSpecialDay(entry.hebrewDate, entry.occasionLabel) !== filters.specialDay) return false;
      if (filters.types.length > 0 && !filters.types.some((type) => entryHasType(entry, type))) return false;
      return true;
    });
    if (entries.length > 0) results.push({ hebrewYear: year, entries });
  }
  return results;
}
