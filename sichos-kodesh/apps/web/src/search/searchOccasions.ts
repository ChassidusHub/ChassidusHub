import {
  CHAG_CATEGORIES,
  isHighlightedFarbrengenHanacha,
  mafteiachDay,
  mafteiachMonthToken,
  mafteiachMonthTokenToHDateMonth,
  occasionChagCategory,
  occasionParsha,
} from '@sichos-kodesh/catalog';
import type { CatalogByYear, CatalogEntry, ChagCategory, PdfSection } from '@sichos-kodesh/catalog';
import { IL } from '../config';

/** "hanacha" is the highlighted Sichos Kodesh/Toras Menachem transcript specifically (see isHighlightedFarbrengenHanacha) - a meaningful search target in its own right, distinct from bilti mugah generally. */
export type ContentType = 'audio' | 'hanacha' | PdfSection;

const CHAG_CATEGORY_SET: ReadonlySet<string> = new Set(CHAG_CATEGORIES);

function isChagCategory(value: string): value is ChagCategory {
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
  /** OR'd together - an entry matches if it has *any* of the selected types; empty means no type filter. */
  types: ContentType[];
}

export const EMPTY_FILTERS: SearchFilters = { query: '', hebrewYear: null, hdateMonth: null, day: null, parsha: null, types: [] };

export interface SearchResultGroup {
  hebrewYear: number;
  entries: CatalogEntry[];
}

/** Strips ASCII and Hebrew quote-like punctuation before comparing - the same character (a Hebrew abbreviation mark) can appear as a straight ASCII quote or the proper Hebrew gershayim/geresh depending on where it came from (see utils/hebrewPunctuation.ts), and a search shouldn't fail just because the query and the label happen to use different forms of it. */
function normalize(text: string): string {
  return text.replace(/["'״׳]/g, '').trim().toLowerCase();
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
    filters.types.length > 0
  );
}

/**
 * Scans the whole bundled catalog - a few thousand occasions, cheap enough
 * to filter synchronously on every keystroke/filter change without an
 * index; `occasionParsha` only runs (and only then pays for building a
 * year's `Sedra`) when the parsha filter is actually set, and caches that
 * per year internally, so leaving it off costs nothing.
 */
export function searchOccasions(catalog: CatalogByYear, filters: SearchFilters): SearchResultGroup[] {
  if (!hasActiveFilters(filters)) return [];
  const query = normalize(filters.query);
  const results: SearchResultGroup[] = [];
  const years = Object.keys(catalog)
    .map(Number)
    .sort((a, b) => a - b);

  for (const year of years) {
    if (filters.hebrewYear != null && year !== filters.hebrewYear) continue;
    const entries = (catalog[year] ?? []).filter((entry) => {
      if (entry.audio.length === 0 && entry.pdfs.length === 0) return false;
      if (query && !normalize(entry.occasionLabel).includes(query)) return false;
      if (filters.hdateMonth != null && mafteiachMonthTokenToHDateMonth(mafteiachMonthToken(entry.hebrewDate)) !== filters.hdateMonth) return false;
      if (filters.day != null && mafteiachDay(entry.hebrewDate) !== filters.day) return false;
      if (filters.parsha) {
        if (isChagCategory(filters.parsha)) {
          if (occasionChagCategory(entry.hebrewDate, IL) !== filters.parsha) return false;
        } else {
          const parsha = occasionParsha(entry.hebrewDate, IL);
          if (!parsha || !parsha.includes(filters.parsha)) return false;
        }
      }
      if (filters.types.length > 0 && !filters.types.some((type) => entryHasType(entry, type))) return false;
      return true;
    });
    if (entries.length > 0) results.push({ hebrewYear: year, entries });
  }
  return results;
}
