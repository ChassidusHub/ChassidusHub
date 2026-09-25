import { describe, expect, it } from 'vitest';
import { addLibraryViews } from '../src/library/views.js';
import type { CatalogLibrary } from '../src/library/types.js';

const maamar = (id: string, hebrewDate: string, occasionId: number) => ({
  id,
  label: id,
  diburHamaschil: id,
  occasionLabel: '',
  hebrewYear: Number(hebrewDate.slice(0, 4)),
  hebrewDate,
  occasionId,
  melukatVolumes: [],
  citations: [],
  refs: [],
});

// Two Yud Shevat maamorim of different years, one Tu B'Shevat, one of Adar I and one of Adar II.
const library = {
  moadim: [{ slug: 'yud_shevat', name: 'יו"ד שבט', nameEn: 'Yud Shevat', occasionIds: [10, 11] }],
  parshiyos: [{ slug: 'beshalach', name: 'בשלח', occasionIds: [11, 12] }],
  collections: {
    likkuteiSichos: { items: [], groups: {} },
    maamorim: {
      items: [maamar('b', '5712-05-10', 11), maamar('a', '5711-05-10', 10), maamar('c', '5711-05-15', 12), maamar('d', '5738-06A-14', 13), maamar('e', '5738-06B-14', 14)],
      groups: { year: [] },
    },
    reshimos: { items: [], groups: {} },
    yomanim: { items: [], groups: {} },
    michtavimKlolim: { items: [], groups: {} },
    hadranim: { items: [], groups: {} },
    jemEvents: { items: [], groups: {} },
  },
} as unknown as CatalogLibrary;

describe('the library views', () => {
  const viewed = addLibraryViews(library, {
    melukatByMonths: {
      parts: [
        { part: 2, he: 'חלק ב׳', en: 'Part 2' },
        { part: 3, he: 'חלק ג׳', en: 'Part 3' },
      ],
      entries: [
        { part: 2, month: 'שבט', title: 'באתי לגני תשי"ב', maamar: 'b' },
        { part: 2, month: 'שבט', title: 'רשימה', maamar: null },
        { part: 2, month: 'שבט', title: 'באתי לגני תשי"א', maamar: 'a' },
        { part: 2, month: 'שבט', title: 'באתי לגני תשי"א, כפי שהוגה', maamar: 'a' },
        { part: 3, month: 'אדר', title: 'לא בספרייה', maamar: 'zz' },
      ],
    },
  });
  const groups = viewed.collections.maamorim.groups;

  it('lists a month across the years, one occasion together: by day, then by year; Adar I and II are one Adar', () => {
    expect(groups.month!.map((group) => [group.slug, group.name, group.nameEn, group.itemIds])).toEqual([
      ['05', 'שבט', 'Shevat', ['a', 'b', 'c']],
      ['06', 'אדר', 'Adar', ['d', 'e']],
    ]);
  });

  it("finds a moed's and a parsha's maamorim through their occasions, by date", () => {
    expect(groups.moad).toEqual([{ slug: 'yud_shevat', name: 'יו"ד שבט', nameEn: 'Yud Shevat', itemIds: ['a', 'b'] }]);
    expect(groups.parsha).toEqual([{ slug: 'beshalach', name: 'בשלח', itemIds: ['c', 'b'] }]);
  });

  it("follows the edition by months' own order, each maamar once, and leaves out what the library lacks", () => {
    expect(groups.melukatByMonths).toEqual([
      { slug: '2', name: 'חלק ב׳', nameEn: 'Part 2', itemIds: ['b', 'a'] },
      { slug: '3', name: 'חלק ג׳', nameEn: 'Part 3', itemIds: [] },
    ]);
    expect(groups.year).toEqual([]);
  });

  it('adds no view a collection has nothing for, and leaves the input as it was', () => {
    expect(Object.keys(viewed.collections.reshimos.groups)).toEqual([]);
    expect(Object.keys(library.collections.maamorim.groups)).toEqual(['year']);
  });
});
