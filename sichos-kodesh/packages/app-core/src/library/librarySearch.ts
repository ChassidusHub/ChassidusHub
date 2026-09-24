import Fuse from 'fuse.js';
import { normalize } from '../search/searchOccasions.js';
import type { CatalogLibrary, LibraryCollectionId, LibraryItemBase, OccasionGroup } from '@sichos-kodesh/catalog';
import { itemSubtitle } from './libraryModel.js';

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

function collectionIndex(library: CatalogLibrary, collection: LibraryCollectionId): Fuse<IndexedItem> {
  const source = library.collections[collection];
  let fuse = indexes.get(source);
  if (!fuse) {
    const items = (source.items as LibraryItemBase[]).map((item) => ({
      item,
      // The name in both languages, where the catalog has it in both (JEM's recordings, mafteiach's names).
      label: normalize([item.label, item.labelHe, item.labelEn].filter(Boolean).join(' ')),
      details: normalize(`${itemSubtitle(collection, item, 'he')} ${itemSubtitle(collection, item, 'en')}`),
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
