import type { ShelfWork, WorksShelf } from './api';

/**
 * The library shelf's list: one shelf for everything that is not a
 * farbrengen. The Rebbe's Torah comes first - his collections, and his own
 * seforim (Igros Kodesh, the Maanos once they may ship) each an entry of
 * its own beside them - then what was written around it, then the seforim
 * of the Rebbeim before him, together. The order is the app's home screen's.
 * Pure, so it is tested without a browser.
 */

/** The works shelf's author whose seforim stand in the library as entries of their own. */
export const LIBRARY_AUTHOR = 'the-rebbe';

/** Where each collection stands; `works` marks the place of the Rebbe's own seforim. */
const ORDER = ['likkuteiSichos', 'maamorim', 'works', 'michtavimKlolim', 'reshimos', 'hadranim', 'yomanim'] as const;

export type LibraryEntry = { kind: 'collection'; id: string } | { kind: 'work'; work: ShelfWork } | { kind: 'seforim'; shelf: WorksShelf };

/** An entry's key: stable across a reload of the shelf, unique on it. */
export function entryKey(entry: LibraryEntry): string {
  if (entry.kind === 'collection') return entry.id;
  if (entry.kind === 'work') return `work:${entry.work.id}`;
  return 'seforim';
}

/** The library's entries: the collections the archive has, the Rebbe's seforim among them, and the rest of the seforim last. */
export function libraryEntries(collections: string[], shelf: WorksShelf | null): LibraryEntry[] {
  const own = shelf?.works.filter((w) => w.author === LIBRARY_AUTHOR) ?? [];
  const rest = shelf?.works.filter((w) => w.author !== LIBRARY_AUTHOR) ?? [];
  const ownIds = new Set(own.map((w) => w.id));
  const entries: LibraryEntry[] = [];
  for (const place of ORDER) {
    if (place === 'works') entries.push(...own.map((work): LibraryEntry => ({ kind: 'work', work })));
    else if (collections.includes(place)) entries.push({ kind: 'collection', id: place });
  }
  // A collection the site does not place yet still shows, before the seforim.
  for (const id of collections) if (!(ORDER as readonly string[]).includes(id)) entries.push({ kind: 'collection', id });
  if (shelf && rest.length > 0) {
    entries.push({ kind: 'seforim', shelf: { ...shelf, works: rest, bundles: shelf.bundles.map((b) => ({ ...b, works: b.works.filter((id) => !ownIds.has(id)) })).filter((b) => b.works.length > 0) } });
  }
  return entries;
}
