import Fuse from 'fuse.js';
import { normalize } from '../search/searchOccasions.js';
import type { CatalogLibrary, LibraryCollectionId, LibraryGroup, LibraryItemBase, OccasionGroup } from '@sichos-kodesh/catalog';
import { mafteiachMonthTokenToHDateMonth } from '@sichos-kodesh/catalog';
import { itemDescription, itemSubtitle, LIBRARY_ORDER } from './libraryModel.js';

/**
 * Search over one library collection (docs/offline-plan.md WP4b: the
 * collection filter in search). The farbrengens keep app-core's
 * searchOccasions; a collection's items are matched here, on their label
 * and on the line under it in both languages (the occasion a maamar was
 * said at, a JEM event's type and date), with the same Fuse settings and
 * normalisation as the farbrengens' search.
 */

interface IndexedItem {
  item: LibraryItemBase;
  label: string;
  details: string;
}

const indexes = new WeakMap<object, Fuse<IndexedItem>>();

/** Where an item is printed and what it continues: a maamar's citations, kuntres and hemshech, a letter's citations. */
function printedIn(item: LibraryItemBase): string[] {
  const record = item as LibraryItemBase & { citations?: unknown; kuntres?: unknown; hemshech?: unknown };
  const citations = Array.isArray(record.citations)
    ? record.citations.map((citation: unknown) => (typeof citation === 'string' ? citation : typeof (citation as { label?: unknown })?.label === 'string' ? (citation as { label: string }).label : ''))
    : [];
  return [...citations, typeof record.kuntres === 'string' ? record.kuntres : '', typeof record.hemshech === 'string' ? record.hemshech : ''];
}

function collectionIndex(library: CatalogLibrary, collection: LibraryCollectionId): Fuse<IndexedItem> {
  const source = library.collections[collection];
  let fuse = indexes.get(source);
  if (!fuse) {
    const items = (source.items as LibraryItemBase[]).map((item) => ({
      item,
      // The name in both languages, where the catalog has it in both (JEM's recordings, mafteiach's names).
      label: normalize([item.label, item.labelHe, item.labelEn].filter(Boolean).join(' ')),
      // Where and when, the whole names the subtitles shorten, and where it is printed.
      details: normalize(
        [itemSubtitle(collection, item, 'he'), itemSubtitle(collection, item, 'en'), itemDescription(collection, item, 'he'), itemDescription(collection, item, 'en'), ...printedIn(item)]
          .filter(Boolean)
          .join(' '),
      ),
    }));
    fuse = new Fuse(items, { keys: ['label', 'details'], threshold: 0.3, ignoreLocation: true, minMatchCharLength: 2, useExtendedSearch: true });
    indexes.set(source, fuse);
  }
  return fuse;
}

/** The Hebrew years a collection's items fall in, oldest first - the year dropdown's choices. */
export function collectionYears(library: CatalogLibrary, collection: LibraryCollectionId): number[] {
  const years = new Set<number>();
  for (const item of library.collections[collection].items as LibraryItemBase[]) if (item.hebrewYear !== undefined) years.add(item.hebrewYear);
  return [...years].sort((a, b) => a - b);
}

/**
 * The items matching a query and year, in the collection's own order. With
 * no query and no year there is nothing to show (as with the farbrengens:
 * an empty search lists nothing rather than everything).
 */
export function searchLibrary(library: CatalogLibrary, collection: LibraryCollectionId, query: string, hebrewYear: number | null): LibraryItemBase[] {
  const text = normalize(query);
  if (!text && hebrewYear == null) return [];
  const matched = text ? new Set(collectionIndex(library, collection).search(text).map((result) => result.item.item)) : null;
  return (library.collections[collection].items as LibraryItemBase[]).filter(
    (item) => (hebrewYear == null || item.hebrewYear === hebrewYear) && (!matched || matched.has(item)),
  );
}

/** The occasions a moed and a parsha choice leave (both lists are mafteiach's), or null when neither is chosen. */
export function occasionFilter(groups: Array<OccasionGroup | undefined>): ReadonlySet<number> | null {
  const chosen = groups.filter((group): group is OccasionGroup => !!group);
  if (chosen.length === 0) return null;
  const [first, ...rest] = chosen;
  const others = rest.map((group) => new Set(group.occasionIds));
  return new Set(first!.occasionIds.filter((id) => others.every((ids) => ids.has(id))));
}

/**
 * Where one search looks (both apps' search page): everything, or one part -
 * the farbrengens, one collection of the library, the seforim.
 */
export type SearchScope = 'all' | 'farbrengens' | LibraryCollectionId | 'seforim';
export const SEARCH_SCOPES: readonly SearchScope[] = ['all', 'farbrengens', ...LIBRARY_ORDER, 'seforim'];

/**
 * The filters a library item can be held to, the same ones the farbrengens
 * take: a year, a month and day (a mafteiach month as `MAFTEIACH_MONTH_OPTIONS`
 * numbers it), and mafteiach's parsha and moed (slugs of the library's
 * `parshiyos` and `moadim`). An item that can't say - a letter has no
 * parsha - is left out while that filter is on.
 */
export interface ItemFilters {
  hebrewYear: number | null;
  hdateMonth: number | null;
  day: number | null;
  parshaSlug: string | null;
  moedSlug: string | null;
}

export const NO_ITEM_FILTERS: ItemFilters = { hebrewYear: null, hdateMonth: null, day: null, parshaSlug: null, moedSlug: null };

export function hasItemFilters(filters: ItemFilters): boolean {
  return filters.hebrewYear != null || filters.hdateMonth != null || filters.day != null || filters.parshaSlug != null || filters.moedSlug != null;
}

/** The month and day of an item's date (`5711-05-10`), or of its month (a yoman's `monthToken`). */
function itemMonthDay(item: LibraryItemBase): { month: number | null; day: number | null } {
  const date = item.hebrewDate?.match(/^\d{4}-(\d{2}[AB]?)-(\d{2})/);
  if (date) return { month: mafteiachMonthTokenToHDateMonth(date[1]!), day: Number(date[2]) };
  const token = (item as { monthToken?: unknown }).monthToken;
  return { month: typeof token === 'string' ? mafteiachMonthTokenToHDateMonth(token) : null, day: null };
}

/**
 * The items of a parsha or moed choice: through the occasion an item was
 * said at, as the library's own views do; Likkutei Sichos by its own
 * parsha and moed headings, matched by name.
 */
function axisMembers(library: CatalogLibrary, collection: LibraryCollectionId, axis: 'parsha' | 'moad', slug: string): ReadonlySet<string> | ReadonlySet<number> {
  const groups = axis === 'parsha' ? library.parshiyos : library.moadim;
  const chosen = groups.find((group) => group.slug === slug);
  if (!chosen) return new Set<number>();
  if (collection === 'likkuteiSichos') {
    const name = normalize(chosen.name);
    const own: LibraryGroup | undefined = library.collections.likkuteiSichos.groups[axis]?.find((group) => normalize(group.name) === name);
    return new Set(own?.itemIds ?? []);
  }
  return new Set(chosen.occasionIds);
}

/**
 * The items of one collection matching a query and the filters, in the
 * collection's own order. A query matches an item's name in both languages
 * and the line under it - where and when it was said, and the whole names
 * the titles shorten. With no query and no filter there is nothing to show.
 */
export function searchLibraryItems(library: CatalogLibrary, collection: LibraryCollectionId, query: string, filters: ItemFilters): LibraryItemBase[] {
  const text = normalize(query);
  if (!text && !hasItemFilters(filters)) return [];
  const matched = text ? new Set(collectionIndex(library, collection).search(text).map((result) => result.item.item)) : null;
  const parsha = filters.parshaSlug ? axisMembers(library, collection, 'parsha', filters.parshaSlug) : null;
  const moed = filters.moedSlug ? axisMembers(library, collection, 'moad', filters.moedSlug) : null;
  const inAxis = (members: ReadonlySet<string> | ReadonlySet<number>, item: LibraryItemBase) => {
    if (collection === 'likkuteiSichos') return (members as ReadonlySet<string>).has(item.id);
    const occasionId = (item as { occasionId?: unknown }).occasionId;
    return typeof occasionId === 'number' && (members as ReadonlySet<number>).has(occasionId);
  };
  return (library.collections[collection].items as LibraryItemBase[]).filter((item) => {
    if (matched && !matched.has(item)) return false;
    if (filters.hebrewYear != null && item.hebrewYear !== filters.hebrewYear) return false;
    if (filters.hdateMonth != null || filters.day != null) {
      const { month, day } = itemMonthDay(item);
      if (filters.hdateMonth != null && month !== filters.hdateMonth) return false;
      if (filters.day != null && day !== filters.day) return false;
    }
    if (parsha && !inAxis(parsha, item)) return false;
    if (moed && !inAxis(moed, item)) return false;
    return true;
  });
}
