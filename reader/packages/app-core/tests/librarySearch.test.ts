import { describe, expect, it } from 'vitest';
import type { CatalogLibrary } from '@chassidushub-reader/catalog';
import { NO_ITEM_FILTERS, hasItemFilters, searchLibraryItems } from '../src/library/librarySearch.js';

// A library in the catalog's shape, trimmed to what the search reads.
const library = {
  moadim: [{ slug: 'yud_shevat', name: 'יו"ד שבט', nameEn: 'Yud Shevat', occasionIds: [10] }],
  parshiyos: [{ slug: 'bereshit', name: 'בראשית', nameEn: 'Bereishis', occasionIds: [20] }],
  collections: {
    likkuteiSichos: {
      items: [
        { id: '1:1', label: `ח"א ע' 1 (בראשית)`, refs: [] },
        { id: '1:9', label: `ח"א ע' 9 (נח)`, refs: [] },
      ],
      groups: { parsha: [{ slug: 'bereshit-ls', name: 'בראשית', itemIds: ['1:1'] }, { slug: 'noach', name: 'נח', itemIds: ['1:9'] }] },
    },
    maamorim: {
      items: [
        { id: 'a', label: 'באתי לגני', diburHamaschil: 'באתי לגני', occasionLabel: 'יו"ד שבט', hebrewYear: 5711, hebrewDate: '5711-05-10', occasionId: 10, melukatVolumes: [], citations: ['סה"מ מלוקט ח"א'], kuntres: 'קונטרס יו"ד שבט', refs: [] },
        { id: 'b', label: 'בראשית ברא', diburHamaschil: 'בראשית ברא', occasionLabel: 'ש"פ בראשית', hebrewYear: 5712, hebrewDate: '5712-01-25', occasionId: 20, melukatVolumes: [], citations: [], refs: [] },
      ],
      groups: {},
    },
    reshimos: { items: [], groups: {} },
    yomanim: { items: [{ id: 'y', label: 'יומן', hebrewYear: 5711, monthToken: '05', refs: [] }], groups: {} },
    michtavimKlolim: { items: [{ id: 'm', label: 'מכתב כללי', hebrewYear: 5711, refs: [] }], groups: {} },
    hadranim: { items: [], groups: {} },
    jemEvents: { items: [], groups: {} },
  },
} as unknown as CatalogLibrary;

const ids = (list: Array<{ id: string }>) => list.map((item) => item.id);

describe('searching the library with filters', () => {
  it('shows nothing with no query and no filter', () => {
    expect(hasItemFilters(NO_ITEM_FILTERS)).toBe(false);
    expect(searchLibraryItems(library, 'maamorim', '', NO_ITEM_FILTERS)).toEqual([]);
  });

  it("holds the maamorim to a month and day, and to mafteiach's moed and parsha through their occasions", () => {
    expect(ids(searchLibraryItems(library, 'maamorim', '', { ...NO_ITEM_FILTERS, hdateMonth: 11, day: 10 }))).toEqual(['a']);
    expect(ids(searchLibraryItems(library, 'maamorim', '', { ...NO_ITEM_FILTERS, moedSlug: 'yud_shevat' }))).toEqual(['a']);
    expect(ids(searchLibraryItems(library, 'maamorim', '', { ...NO_ITEM_FILTERS, parshaSlug: 'bereshit' }))).toEqual(['b']);
    expect(ids(searchLibraryItems(library, 'maamorim', 'באתי', { ...NO_ITEM_FILTERS, hebrewYear: 5711 }))).toEqual(['a']);
    // Where it is printed is searched too.
    expect(ids(searchLibraryItems(library, 'maamorim', 'מלוקט', NO_ITEM_FILTERS))).toEqual(['a']);
    expect(ids(searchLibraryItems(library, 'maamorim', 'קונטרס', NO_ITEM_FILTERS))).toEqual(['a']);
  });

  it("finds Likkutei Sichos' own parsha by its name, a yoman by its month, and leaves out what can't say", () => {
    expect(ids(searchLibraryItems(library, 'likkuteiSichos', '', { ...NO_ITEM_FILTERS, parshaSlug: 'bereshit' }))).toEqual(['1:1']);
    expect(ids(searchLibraryItems(library, 'yomanim', '', { ...NO_ITEM_FILTERS, hdateMonth: 11 }))).toEqual(['y']);
    expect(searchLibraryItems(library, 'michtavimKlolim', '', { ...NO_ITEM_FILTERS, parshaSlug: 'bereshit' })).toEqual([]);
    expect(ids(searchLibraryItems(library, 'michtavimKlolim', '', { ...NO_ITEM_FILTERS, hebrewYear: 5711 }))).toEqual(['m']);
  });
});
