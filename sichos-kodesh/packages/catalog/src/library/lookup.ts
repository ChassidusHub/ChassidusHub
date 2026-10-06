import type { CatalogLibrary, LibraryCollectionId, LibraryCollections, OccasionGroup } from './types.js';
import { LIBRARY_COLLECTION_IDS } from './types.js';

/**
 * Lookups over a library. The reverse indexes are built on first use and
 * kept per library object (a WeakMap), so a newer release applied at run
 * time simply gets its own.
 */

interface Indexes {
  moadimByOccasion: Map<number, OccasionGroup[]>;
  parshiyosByOccasion: Map<number, OccasionGroup[]>;
  items: Map<LibraryCollectionId, Map<string, LibraryCollections[LibraryCollectionId]['items'][number]>>;
}

const cache = new WeakMap<CatalogLibrary, Indexes>();

function byOccasion(groups: OccasionGroup[]): Map<number, OccasionGroup[]> {
  const map = new Map<number, OccasionGroup[]>();
  for (const group of groups) {
    for (const id of group.occasionIds) {
      const list = map.get(id);
      if (list) list.push(group);
      else map.set(id, [group]);
    }
  }
  return map;
}

function indexes(library: CatalogLibrary): Indexes {
  let built = cache.get(library);
  if (!built) {
    built = {
      moadimByOccasion: byOccasion(library.moadim),
      parshiyosByOccasion: byOccasion(library.parshiyos),
      items: new Map(LIBRARY_COLLECTION_IDS.map((id) => [id, new Map(library.collections[id].items.map((item) => [item.id, item]))])),
    };
    cache.set(library, built);
  }
  return built;
}

/** The moadim mafteiach lists a farbrengen occasion under (Yud Shevat, Chanukah, a rally...), in mafteiach's order. */
export function occasionMoadim(library: CatalogLibrary, occasionId: number): OccasionGroup[] {
  return indexes(library).moadimByOccasion.get(occasionId) ?? [];
}

/** The parsha(s) mafteiach lists a farbrengen occasion under. */
export function occasionParshiyos(library: CatalogLibrary, occasionId: number): OccasionGroup[] {
  return indexes(library).parshiyosByOccasion.get(occasionId) ?? [];
}

export function moadBySlug(library: CatalogLibrary, slug: string): OccasionGroup | undefined {
  return library.moadim.find((moad) => moad.slug === slug);
}

export function libraryItem<C extends LibraryCollectionId>(library: CatalogLibrary, collection: C, id: string): LibraryCollections[C]['items'][number] | undefined {
  return indexes(library).items.get(collection)?.get(id) as LibraryCollections[C]['items'][number] | undefined;
}

/** Items per collection - what a manifest and an About screen show. */
export function libraryCounts(library: CatalogLibrary): Record<LibraryCollectionId, number> {
  return Object.fromEntries(LIBRARY_COLLECTION_IDS.map((id) => [id, library.collections[id].items.length])) as Record<LibraryCollectionId, number>;
}
