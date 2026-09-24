import { describe, expect, it } from 'vitest';
import type { CatalogShelf } from '@sichos-kodesh/catalog';
import { createCatalogStore } from '../catalog/catalogStore.js';
import { authorShelf, hebrewBooksUrl, scanCount, scanLabel, searchShelf, workScans } from './shelf.js';

// A shelf in the catalog's shape; the ids are HebrewBooks', the rest trimmed.
const SHELF: CatalogShelf = {
  catalogVersion: '9',
  authors: [
    {
      authorId: 'the-rebbe',
      series: [
        {
          title: 'לקוטי שיחות',
          workId: 'likkutei-sichos',
          scans: [
            { id: 14924, title: 'לקוטי שיחות - א (בראשית - שמות - ויקרא)', volume: 'א (בראשית - שמות - ויקרא)', printed: 'ניו יורק', pages: 306 },
            { id: 14925, title: 'לקוטי שיחות - ב (במדבר - דברים)', volume: 'ב (במדבר - דברים)', pages: 470 },
          ],
        },
        { title: 'שערי המועדים', scans: [{ id: 30001, title: 'שערי המועדים - חג החנוכה', volume: 'חג החנוכה' }] },
        { title: 'היום יום', workId: 'hayom-yom', scans: [{ id: 43302, title: 'היום יום', pages: 131 }] },
      ],
    },
    { authorId: null, series: [{ title: 'קובץ הערות התמימים ואנ״ש', scans: [{ id: 26000, title: 'קובץ הערות התמימים ואנ״ש', volume: 'מאריסטאן No. א' }] }] },
  ],
};

describe('the HebrewBooks shelf', () => {
  it('links a scan to its page on HebrewBooks, never the PDF', () => {
    expect(hebrewBooksUrl(14924)).toBe('https://hebrewbooks.org/14924');
  });

  it('gives a sefer its own series, and an author the rest', () => {
    expect(workScans(SHELF, 'likkutei-sichos').map((s) => s.title)).toEqual(['לקוטי שיחות']);
    expect(workScans(SHELF, 'tanya')).toEqual([]);
    expect(workScans(null, 'likkutei-sichos')).toEqual([]);
    expect(authorShelf(SHELF, 'the-rebbe').map((s) => s.title)).toEqual(['שערי המועדים']);
    expect(authorShelf(SHELF, null).map((s) => s.title)).toEqual(['קובץ הערות התמימים ואנ״ש']);
    expect(authorShelf(SHELF, 'alter-rebbe')).toEqual([]);
    expect(scanCount(SHELF.authors[0]!.series)).toBe(4);
  });

  it('names a scan by its volume, or its title when it has none', () => {
    expect(scanLabel(SHELF.authors[0]!.series[0]!.scans[1]!)).toBe('ב (במדבר - דברים)');
    expect(scanLabel(SHELF.authors[0]!.series[2]!.scans[0]!)).toBe('היום יום');
  });

  it('finds a series by its title, or the scans that match inside it', () => {
    const all = SHELF.authors[0]!.series;
    expect(searchShelf(all, '').length).toBe(3);
    expect(searchShelf(all, 'ליקוטי').map((s) => s.title)).toEqual([]);
    expect(searchShelf(all, 'לקוטי שיחות').map((s) => s.scans.length)).toEqual([2]);
    expect(searchShelf(all, 'במדבר').map((s) => [s.title, s.scans.map((x) => x.id)])).toEqual([['לקוטי שיחות', [14925]]]);
    expect(searchShelf(all, 'חנוכה').map((s) => s.title)).toEqual(['שערי המועדים']);
  });

  it('comes from the bundle until a release carries its own', () => {
    let loads = 0;
    const store = createCatalogStore({}, '1.5.0', 3, () => null, {
      index: () => ({ authors: [], works: [] }),
      contents: () => null,
      shelf: () => {
        loads += 1;
        return SHELF;
      },
    });
    expect(store.getShelf()).toBe(SHELF);
    store.getShelf();
    expect(loads).toBe(1);
    const newer: CatalogShelf = { catalogVersion: '10', authors: [] };
    const release = { schemaVersion: 3, version: '1.6.0', releasedAt: '2026-10-01T00:00:00Z', byYear: {}, library: { collections: {}, moadim: [], parshiyos: [] }, works: { authors: [], works: [], contents: {}, shelf: newer } };
    expect(store.apply(release as never, 'fetched')).toBe(true);
    expect(store.getShelf()).toBe(newer);
    const withoutShelf = { ...release, version: '1.7.0', works: { authors: [], works: [], contents: {} } };
    expect(store.apply(withoutShelf as never, 'fetched')).toBe(true);
    expect(store.getShelf()).toBe(SHELF);
  });

  it('is null in an app built without it', () => {
    expect(createCatalogStore({}, '1.5.0', 3).getShelf()).toBeNull();
  });
});
