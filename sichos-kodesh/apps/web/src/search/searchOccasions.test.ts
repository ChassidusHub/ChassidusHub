import { describe, expect, it } from 'vitest';
import type { CatalogByYear, CatalogEntry } from '@sichos-kodesh/catalog';
import { EMPTY_FILTERS, hasActiveFilters, searchOccasions } from './searchOccasions';

function makeEntry(overrides: Partial<CatalogEntry> & Pick<CatalogEntry, 'occasionId' | 'hebrewYear' | 'hebrewDate' | 'occasionLabel'>): CatalogEntry {
  return { audio: [], pdfs: [], ...overrides };
}

// Yud Shevat 5711 (real, verified: Parshas Beshalach - see packages/catalog/tests/occasionParsha.test.ts).
const yudShevat = makeEntry({
  occasionId: 1,
  hebrewYear: 5711,
  hebrewDate: '5711-05-10',
  occasionLabel: 'יו"ד שבט',
  audio: [{ workerFilename: 'a.mp3', durationMs: 1000, chapterName: 'Sicha 1' }],
  pdfs: [{ section: 'biltiMugah', label: 'שיחו"ק', driveFileId: 'x' }],
});
const purim = makeEntry({
  occasionId: 2,
  hebrewYear: 5712,
  hebrewDate: '5712-06-14',
  occasionLabel: 'פורים',
  pdfs: [{ section: 'maamorim', label: 'מאמר', driveFileId: 'y' }],
});
const gap = makeEntry({ occasionId: 3, hebrewYear: 5711, hebrewDate: '5711-05-20', occasionLabel: 'gap - no content' });
// 5711 is a leap year (token "06A" for Adar I); this exercises the leap/non-leap equivalence the month filter needs.
const purimKoton = makeEntry({
  occasionId: 4,
  hebrewYear: 5711,
  hebrewDate: '5711-06A-14',
  occasionLabel: 'פורים קטן',
  audio: [{ workerFilename: 'b.mp3', durationMs: 500 }],
});
// 15 Tishrei 5711 - Sukkos I, a real Yom Tov (verified against hebcal's CHAG
// flag directly - see packages/catalog/tests/occasionChag.test.ts). Given a
// PDF, not audio, so it doesn't also perturb the 'audio' type filter test.
const sukkos = makeEntry({
  occasionId: 5,
  hebrewYear: 5711,
  hebrewDate: '5711-01-15',
  occasionLabel: 'א\' דחג הסוכות',
  pdfs: [{ section: 'hagahos', label: 'הגהות', driveFileId: 'z' }],
});

const catalog: CatalogByYear = { 5711: [yudShevat, gap, purimKoton, sukkos], 5712: [purim] };

describe('hasActiveFilters', () => {
  it('is false for the empty filter set', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });
  it('is true once any single field is set', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, hebrewYear: 5711 })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, types: ['audio'] })).toBe(true);
  });
});

describe('searchOccasions', () => {
  it('returns nothing for the empty filter set, without scanning the catalog', () => {
    expect(searchOccasions(catalog, EMPTY_FILTERS)).toEqual([]);
  });

  it('matches free text against the occasion label, ignoring quote-mark differences', () => {
    const result = searchOccasions(catalog, { ...EMPTY_FILTERS, query: "יו\"ד" });
    expect(result).toEqual([{ hebrewYear: 5711, entries: [yudShevat] }]);
    // Same query, but with a real Hebrew gershayim instead of the ASCII quote - still matches.
    const result2 = searchOccasions(catalog, { ...EMPTY_FILTERS, query: 'יו״ד' });
    expect(result2).toEqual([{ hebrewYear: 5711, entries: [yudShevat] }]);
    // A "smart"/curly quote (as opposed to a straight ASCII one or the proper Hebrew gershayim) - still matches.
    const result3 = searchOccasions(catalog, { ...EMPTY_FILTERS, query: 'יו”ד' });
    expect(result3).toEqual([{ hebrewYear: 5711, entries: [yudShevat] }]);
  });

  it('matches free text with no gershayim at all, or with a missing/wrong letter (typo tolerance)', () => {
    const noMark = searchOccasions(catalog, { ...EMPTY_FILTERS, query: 'יוד שבט' });
    expect(noMark).toEqual([{ hebrewYear: 5711, entries: [yudShevat] }]);

    // 'סוכות' with one letter swapped for a visually similar one.
    const typo = searchOccasions(catalog, { ...EMPTY_FILTERS, query: 'דחג הסוכת' });
    expect(typo).toEqual([{ hebrewYear: 5711, entries: [sukkos] }]);
  });

  it('matches free text regardless of word order', () => {
    const result = searchOccasions(catalog, { ...EMPTY_FILTERS, query: 'הסוכות דחג' });
    expect(result).toEqual([{ hebrewYear: 5711, entries: [sukkos] }]);
  });

  it('omits a contentless entry even when its label matches', () => {
    const result = searchOccasions(catalog, { ...EMPTY_FILTERS, query: 'gap' });
    expect(result).toEqual([]);
  });

  it('filters by year', () => {
    const result = searchOccasions(catalog, { ...EMPTY_FILTERS, hebrewYear: 5712 });
    expect(result).toEqual([{ hebrewYear: 5712, entries: [purim] }]);
  });

  it('filters by month (HDate-native, e.g. 11 = Shevat)', () => {
    const result = searchOccasions(catalog, { ...EMPTY_FILTERS, hdateMonth: 11 });
    expect(result).toEqual([{ hebrewYear: 5711, entries: [yudShevat] }]);
  });

  it('matches a leap year\'s Adar I and a non-leap year\'s plain Adar as the same month (both HDate month 12)', () => {
    const result = searchOccasions(catalog, { ...EMPTY_FILTERS, hdateMonth: 12 });
    expect(result).toEqual([
      { hebrewYear: 5711, entries: [purimKoton] },
      { hebrewYear: 5712, entries: [purim] },
    ]);
  });

  it('filters by day-of-month, independent of year', () => {
    const result = searchOccasions(catalog, { ...EMPTY_FILTERS, day: 10 });
    expect(result).toEqual([{ hebrewYear: 5711, entries: [yudShevat] }]);
  });

  it('filters by parsha, resolved from the occasion\'s real Hebrew date', () => {
    const result = searchOccasions(catalog, { ...EMPTY_FILTERS, parsha: 'Beshalach' });
    expect(result).toEqual([{ hebrewYear: 5711, entries: [yudShevat] }]);
  });

  it('filters by content type - "hanacha" specifically, not just any PDF', () => {
    const audioResult = searchOccasions(catalog, { ...EMPTY_FILTERS, types: ['audio'] });
    expect(audioResult).toEqual([{ hebrewYear: 5711, entries: [yudShevat, purimKoton] }]);

    const maamorimResult = searchOccasions(catalog, { ...EMPTY_FILTERS, types: ['maamorim'] });
    expect(maamorimResult).toEqual([{ hebrewYear: 5712, entries: [purim] }]);
  });

  it('filters by a chag category through the same "parsha" field, resolved by date rather than by any one PDF/recording', () => {
    const result = searchOccasions(catalog, { ...EMPTY_FILTERS, parsha: 'Sukkot' });
    expect(result).toEqual([{ hebrewYear: 5711, entries: [sukkos] }]);

    // A real parsha name still resolves the normal way, not as a chag.
    const noMatch = searchOccasions(catalog, { ...EMPTY_FILTERS, parsha: 'Yom Kippur' });
    expect(noMatch).toEqual([]);
  });

  it('combines multiple filters with AND', () => {
    const result = searchOccasions(catalog, { ...EMPTY_FILTERS, hebrewYear: 5711, hdateMonth: 11, types: ['audio'] });
    expect(result).toEqual([{ hebrewYear: 5711, entries: [yudShevat] }]);

    const noMatch = searchOccasions(catalog, { ...EMPTY_FILTERS, hebrewYear: 5712, hdateMonth: 11 });
    expect(noMatch).toEqual([]);
  });
});
