import { buildWeeklySchedule, findMatchingYears } from '@chassidushub-reader/kvius-engine';
import { describe, expect, it } from 'vitest';
import { browsableYears, findCatalogEntryForOccasion, hasContent } from '../src/catalogLookup.js';
import { STARTER_FIXED_OCCASIONS } from '../src/fixedOccasions.js';
import { toMafteiachHebrewDateKey } from '../src/hebrewDateKey.js';
import type { CatalogByYear, CatalogEntry } from '../src/index.js';

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return { occasionId: 1, hebrewYear: 5711, hebrewDate: '5711-05-10', occasionLabel: 'test', audio: [], pdfs: [], ...overrides };
}

describe('findCatalogEntryForOccasion', () => {
  it('resolves a "week:N" key to a real kvius-matched year\'s actual date for that week, then finds the catalog entry there', () => {
    // Kvius-matched years share week structure, so week N's parsha is the
    // same even though its Hebrew date differs.
    const { hebrewYear: matchedYear } = findMatchingYears(5786, { fromYear: 5700, toYear: 5786 })[0]!;
    const weekIndex = 10;
    const dateInMatchedYear = buildWeeklySchedule(matchedYear, false)[weekIndex]!;
    const key = toMafteiachHebrewDateKey(dateInMatchedYear.hebrewDate);

    const catalog: CatalogByYear = { [matchedYear]: [entry({ hebrewYear: matchedYear, hebrewDate: key })] };
    const found = findCatalogEntryForOccasion(catalog, matchedYear, `week:${weekIndex}`, false, []);
    expect(found?.hebrewDate).toBe(key);
  });

  it('returns undefined when nothing in the catalog matches that date', () => {
    const catalog: CatalogByYear = { 5711: [entry({ hebrewDate: '5711-01-01' })] };
    expect(findCatalogEntryForOccasion(catalog, 5711, 'week:0', false, [])).toBeUndefined();
  });

  it('resolves a fixed-date occasionKey (e.g. "yud-shevat") using the supplied FixedOccasionDef list', () => {
    // Yud Shevat is always Hebrew month Shevat, day 10 -> mafteiach key "{year}-05-10".
    const catalog: CatalogByYear = { 5711: [entry({ hebrewDate: '5711-05-10' })] };
    const found = findCatalogEntryForOccasion(catalog, 5711, 'yud-shevat', false, STARTER_FIXED_OCCASIONS);
    expect(found?.hebrewDate).toBe('5711-05-10');
  });

  it('resolves Purim to Adar II in a leap year via the resolver function', () => {
    // 5711 is a leap year; Purim (14 Adar) falls in Adar II -> "06B".
    const catalog: CatalogByYear = { 5711: [entry({ hebrewDate: '5711-06B-14' })] };
    const found = findCatalogEntryForOccasion(catalog, 5711, 'purim', false, STARTER_FIXED_OCCASIONS);
    expect(found?.hebrewDate).toBe('5711-06B-14');
  });

  it('returns undefined for an unknown fixed-date key', () => {
    const catalog: CatalogByYear = { 5711: [entry()] };
    expect(findCatalogEntryForOccasion(catalog, 5711, 'not-a-real-occasion', false, STARTER_FIXED_OCCASIONS)).toBeUndefined();
  });
});

describe('hasContent', () => {
  it('is true when the resolved entry has at least one audio recording', () => {
    const catalog: CatalogByYear = {
      5711: [entry({ hebrewDate: '5711-05-10', audio: [{ workerFilename: 'a.mp3', durationMs: 1000 }] })],
    };
    const predicate = hasContent(catalog, false, STARTER_FIXED_OCCASIONS);
    expect(predicate(5711, 'yud-shevat')).toBe(true);
  });

  it('is true when the entry has a PDF but no audio - a real transcript is real content, not a gap', () => {
    const catalog: CatalogByYear = {
      5711: [entry({ hebrewDate: '5711-05-10', audio: [], pdfs: [{ section: 'mugah', label: 'Mugah', driveFileId: 'abc' }] })],
    };
    const predicate = hasContent(catalog, false, STARTER_FIXED_OCCASIONS);
    expect(predicate(5711, 'yud-shevat')).toBe(true);
  });

  it('is false when the entry exists but has neither audio nor a PDF (a genuinely empty occasion)', () => {
    const catalog: CatalogByYear = { 5711: [entry({ hebrewDate: '5711-05-10', audio: [], pdfs: [] })] };
    const predicate = hasContent(catalog, false, STARTER_FIXED_OCCASIONS);
    expect(predicate(5711, 'yud-shevat')).toBe(false);
  });

  it('is false when the year is not in the catalog at all', () => {
    const predicate = hasContent({}, false, STARTER_FIXED_OCCASIONS);
    expect(predicate(5711, 'yud-shevat')).toBe(false);
  });
});

describe('browsableYears', () => {
  it('returns only years with at least one entry that has audio or a PDF, sorted ascending', () => {
    const catalog: CatalogByYear = {
      5713: [entry({ hebrewYear: 5713, audio: [], pdfs: [] })], // present but genuinely empty
      5711: [entry({ hebrewYear: 5711, audio: [{ workerFilename: 'a.mp3', durationMs: 1 }] })],
      5712: [entry({ hebrewYear: 5712, pdfs: [{ section: 'mugah', label: 'Mugah', driveFileId: 'x' }] })],
    };
    expect(browsableYears(catalog)).toEqual([5711, 5712]);
  });

  it('returns an empty list for an empty catalog', () => {
    expect(browsableYears({})).toEqual([]);
  });

  it('excludes a year before MIN_HISTORICAL_YEAR (5710) even with real content - this app is scoped to the current Rebbe\'s own Sichos Kodesh, not the Previous Rebbe\'s pre-Nesius farbrengens', () => {
    const catalog: CatalogByYear = {
      5709: [entry({ hebrewYear: 5709, audio: [{ workerFilename: 'a.mp3', durationMs: 1 }] })],
      5710: [entry({ hebrewYear: 5710, audio: [{ workerFilename: 'b.mp3', durationMs: 1 }] })],
    };
    expect(browsableYears(catalog)).toEqual([5710]);
  });
});
