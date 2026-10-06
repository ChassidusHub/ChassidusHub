import { describe, expect, it } from 'vitest';
import type { CatalogLibrary, CatalogWork, CatalogWorksIndex } from '@chassidushub-reader/catalog';
import { libraryShelf, libraryShelfKey } from './libraryShelf.js';

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), label: String(i), refs: [] }));
// A library with items in every collection but the hadranim, in the catalog's shape (trimmed to what the shelf reads).
const LIBRARY = {
  collections: {
    likkuteiSichos: { items: items(3) },
    maamorim: { items: items(2) },
    reshimos: { items: items(1) },
    yomanim: { items: items(4) },
    michtavimKlolim: { items: items(2) },
    hadranim: { items: [] },
    jemEvents: { items: items(5) },
  },
} as unknown as CatalogLibrary;

const text = { source: 'sefaria', sourceId: 'x', kind: 'text', licence: 'CC0', rights: 'ship' } as const;
const link = { source: 'hebrewbooks', sourceId: 'y', kind: 'scan', licence: 'link', rights: 'link-only' } as const;
const work = (id: string, authors: string[], extra: Partial<CatalogWork>): CatalogWork => ({ id, title: { he: id, en: id }, authors, genre: 'sefer', levels: [], sources: [], ...extra });

const WORKS: CatalogWorksIndex = {
  authors: [
    { id: 'alter-rebbe', name: { he: 'אדמו״ר הזקן', en: 'The Alter Rebbe' }, rebbe: 1 },
    { id: 'the-rebbe', name: { he: 'כ״ק אדמו״ר', en: 'The Rebbe' }, rebbe: 7 },
  ],
  works: [
    work('tanya', ['alter-rebbe'], { units: 53, sources: [text] }),
    work('torah-or-scans', ['alter-rebbe'], { sources: [link] }),
    work('igros-kodesh-rebbe', ['the-rebbe'], { units: 5000, sources: [{ ...text, source: 'igros-app' }] }),
    work('likkutei-sichos', ['the-rebbe'], { collection: 'likkuteiSichos', sources: [] }),
    work('jem', ['the-rebbe'], { collection: 'jemEvents', sources: [] }),
    work('named-only', ['the-rebbe'], {}),
  ],
};

describe('the library shelf', () => {
  it("puts Igros Kodesh among the Rebbe's collections and the Rebbeim's seforim last, skipping an empty collection", () => {
    expect(libraryShelf(LIBRARY, WORKS).map(libraryShelfKey)).toEqual(['likkuteiSichos', 'maamorim', 'work:igros-kodesh-rebbe', 'michtavimKlolim', 'reshimos', 'yomanim', 'jemEvents', 'seforim']);
  });

  it('lists each sefer once, by Rebbe, and no collection twice', () => {
    const seforim = libraryShelf(LIBRARY, WORKS).find((e) => e.kind === 'seforim');
    expect(seforim?.kind === 'seforim' && seforim.sections.map((s) => [s.author?.id, s.works.map((w) => w.id)])).toEqual([['alter-rebbe', ['tanya', 'torah-or-scans']]]);
    expect(seforim?.kind === 'seforim' && seforim.count).toBe(2);
  });

  it('offline, leaves out what opens only on another site', () => {
    const seforim = libraryShelf(LIBRARY, WORKS, { offline: true }).find((e) => e.kind === 'seforim');
    expect(seforim?.kind === 'seforim' && seforim.sections.flatMap((s) => s.works.map((w) => w.id))).toEqual(['tanya']);
  });

  it('counts the items of each collection, and still stands without the works index', () => {
    expect(libraryShelf(LIBRARY, null)).toEqual([
      { kind: 'collection', collection: 'likkuteiSichos', count: 3 },
      { kind: 'collection', collection: 'maamorim', count: 2 },
      { kind: 'collection', collection: 'michtavimKlolim', count: 2 },
      { kind: 'collection', collection: 'reshimos', count: 1 },
      { kind: 'collection', collection: 'yomanim', count: 4 },
      { kind: 'collection', collection: 'jemEvents', count: 5 },
    ]);
    expect(libraryShelf(null, null)).toEqual([]);
  });
});
