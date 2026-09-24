import type { CatalogLibrary } from '@sichos-kodesh/catalog';

const { catalogStore } = require('../catalog/catalogStore') as typeof import('../catalog/catalogStore');
const search = require('./librarySearch') as typeof import('./librarySearch');
const model = require('./libraryModel') as typeof import('./libraryModel');

const library = (): CatalogLibrary => catalogStore.getLibrary()!;

describe('library search', () => {
  it('lists nothing until there is a query or a year', () => {
    expect(search.searchLibrary(library(), 'maamorim', '', null)).toEqual([]);
    expect(search.searchLibrary(library(), 'maamorim', '  ', null)).toEqual([]);
  });

  it('finds a maamar by the words of its dibur hamaschil, typed without its quote marks', () => {
    const maamar = library().collections.maamorim.items.find((item) => item.label.split(' ').length >= 3)!;
    const words = maamar.label.replace(/["'״׳]/g, '').split(' ').slice(0, 3).join(' ');
    expect(search.searchLibrary(library(), 'maamorim', words, null)).toContain(maamar);
  });

  it('keeps to the chosen year, and lists that year alone with no query', () => {
    const year = search.collectionYears(library(), 'maamorim')[5]!;
    const all = search.searchLibrary(library(), 'maamorim', '', year);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((item) => item.hebrewYear === year)).toBe(true);
    expect(all.length).toBe(library().collections.maamorim.items.filter((item) => item.hebrewYear === year).length);
  });

  it('finds an item by the line under it, in either language', () => {
    const event = library().collections.jemEvents.items.find((item) => item.hebrewYear !== undefined && (item as { type?: string }).type)!;
    const type = (event as unknown as { type: string }).type;
    const found = search.searchLibrary(library(), 'jemEvents', type, event.hebrewYear!);
    expect(found).toContain(event);
  });

  it('gives each collection its years, oldest first', () => {
    for (const collection of model.LIBRARY_ORDER) {
      const years = search.collectionYears(library(), collection);
      expect([...years].sort((a, b) => a - b)).toEqual(years);
    }
  });
});

describe('the moed and parsha filter', () => {
  it('is null with no choice, one list alone, and their overlap together', () => {
    const lib = library();
    const moed = lib.moadim.find((group) => group.slug === '10_shvat')!;
    const parsha = lib.parshiyos.find((group) => group.occasionIds.some((id) => moed.occasionIds.includes(id)))!;
    expect(search.occasionFilter([undefined, undefined])).toBeNull();
    expect([...search.occasionFilter([undefined, moed])!]).toEqual(moed.occasionIds.filter((id, i, all) => all.indexOf(id) === i));
    const both = search.occasionFilter([parsha, moed])!;
    expect(both.size).toBeGreaterThan(0);
    for (const id of both) expect(moed.occasionIds.includes(id) && parsha.occasionIds.includes(id)).toBe(true);
  });

  it('names a moed in the interface language', () => {
    const moed = library().moadim.find((group) => group.slug === 'rosh_hashanah')!;
    expect(model.occasionGroupName(moed, 'en')).toBe('Rosh Hashanah');
    expect(model.occasionGroupName(moed, 'he')).toBe('ראש השנה');
    expect(model.occasionGroupName({ ...moed, nameEn: undefined }, 'en')).toBe('ראש השנה');
  });
});
