import { describe, expect, it } from 'vitest';
import type { ShelfWork, WorksShelf } from './api';
import { entryKey, libraryEntries } from './library';

const work = (id: string, author?: string): ShelfWork => ({ id, title: { he: id, en: id }, bundle: author ?? 'more', bytes: 1, texts: 1, ...(author ? { author } : {}) }) as ShelfWork;

const shelf: WorksShelf = {
  bundles: [
    { id: 'alter-rebbe', label: { he: 'ספרי אדמו״ר הזקן', en: "The Alter Rebbe's seforim" }, works: ['tanya'], bytes: 1 },
    { id: 'the-rebbe', label: { he: 'ספרי כ״ק אדמו״ר', en: "The Rebbe's seforim" }, works: ['igros-kodesh-rebbe'], bytes: 1 },
  ],
  authors: [
    { id: 'alter-rebbe', name: { he: 'אדמו״ר הזקן', en: 'The Alter Rebbe' } },
    { id: 'the-rebbe', name: { he: 'כ״ק אדמו״ר', en: 'The Rebbe' } },
  ],
  works: [work('tanya', 'alter-rebbe'), work('igros-kodesh-rebbe', 'the-rebbe'), work('maaneh-lashon')],
};

describe('the library shelf', () => {
  it("puts Igros Kodesh among the Rebbe's collections and the other seforim last, in the app's order", () => {
    const entries = libraryEntries(['likkuteiSichos', 'maamorim', 'yomanim', 'michtavimKlolim', 'hadranim', 'reshimos'], shelf);
    expect(entries.map(entryKey)).toEqual(['likkuteiSichos', 'maamorim', 'work:igros-kodesh-rebbe', 'michtavimKlolim', 'reshimos', 'hadranim', 'yomanim', 'seforim']);
  });

  it("keeps Igros Kodesh off the seforim entry, and the Rebbe's bundle with it", () => {
    const seforim = libraryEntries([], shelf).find((e) => e.kind === 'seforim');
    expect(seforim?.kind === 'seforim' && seforim.shelf.works.map((w) => w.id)).toEqual(['tanya', 'maaneh-lashon']);
    expect(seforim?.kind === 'seforim' && seforim.shelf.bundles.map((b) => b.id)).toEqual(['alter-rebbe']);
  });

  it('has no seforim entry without a works shelf, and nothing at all when the archive has nothing', () => {
    expect(libraryEntries(['maamorim'], null).map(entryKey)).toEqual(['maamorim']);
    expect(libraryEntries([], null)).toEqual([]);
  });
});
