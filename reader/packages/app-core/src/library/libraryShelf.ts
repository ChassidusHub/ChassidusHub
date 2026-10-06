import type { CatalogLibrary, CatalogWork, CatalogWorksIndex, LibraryCollectionId } from '@chassidushub-reader/catalog';
import type { AuthorSection } from '../seforim/seforimModel.js';
import { HOME_WORK_IDS, authorSections, workKind } from '../seforim/seforimModel.js';

/**
 * The library as one shelf (the UI/UX redo plan, "Structure"): the Rebbe's
 * Torah first - his collections, with his own seforim (Igros Kodesh, the
 * Maanos once they may ship) as entries among them - then what was written
 * and recorded around it, then the seforim of the Rebbeim, by Rebbe, as one
 * entry. pack.sk lists the same order (apps/download/src/library.ts).
 */

/** Where each collection stands on the shelf; `works` marks the place of the Rebbe's own seforim. */
export const LIBRARY_SHELF_ORDER: ReadonlyArray<LibraryCollectionId | 'works'> = ['likkuteiSichos', 'maamorim', 'works', 'michtavimKlolim', 'reshimos', 'hadranim', 'yomanim', 'jemEvents'];

export type LibraryShelfEntry =
  | { kind: 'collection'; collection: LibraryCollectionId; count: number }
  | { kind: 'work'; work: CatalogWork }
  | { kind: 'seforim'; sections: AuthorSection[]; count: number };

export interface LibraryShelfOptions {
  /** Offline mode: leave out the seforim that only open on another site. */
  offline?: boolean;
}

/** An entry's key: stable across catalog updates, unique on the shelf. */
export function libraryShelfKey(entry: LibraryShelfEntry): string {
  if (entry.kind === 'collection') return entry.collection;
  if (entry.kind === 'work') return `work:${entry.work.id}`;
  return 'seforim';
}

/**
 * A sefer of the seforim entry: one that opens in the app, or - online -
 * on another site. The Rebbe's own seforim stand as entries of their own,
 * and a work whose units are a library collection is that collection's
 * entry, so neither is listed twice.
 */
function onSeforimEntry(work: CatalogWork, options: LibraryShelfOptions): boolean {
  if (HOME_WORK_IDS.includes(work.id) || work.collection) return false;
  const kind = workKind(work);
  return kind === 'read' || (kind === 'links' && !options.offline);
}

/** The shelf's entries in order: the collections the catalog has items in, the Rebbe's seforim among them, and the seforim of the Rebbeim last. */
export function libraryShelf(library: CatalogLibrary | null, works: CatalogWorksIndex | null, options: LibraryShelfOptions = {}): LibraryShelfEntry[] {
  const own = HOME_WORK_IDS.map((id) => works?.works.find((w) => w.id === id)).filter((w): w is CatalogWork => !!w && workKind(w) !== 'listed');
  const entries: LibraryShelfEntry[] = [];
  for (const place of LIBRARY_SHELF_ORDER) {
    if (place === 'works') {
      entries.push(...own.map((work): LibraryShelfEntry => ({ kind: 'work', work })));
      continue;
    }
    const count = library?.collections[place]?.items.length ?? 0;
    if (count > 0) entries.push({ kind: 'collection', collection: place, count });
  }
  const seforim = works?.works.filter((w) => onSeforimEntry(w, options)) ?? [];
  if (works && seforim.length > 0) entries.push({ kind: 'seforim', sections: authorSections({ ...works, works: seforim }), count: seforim.length });
  return entries;
}
