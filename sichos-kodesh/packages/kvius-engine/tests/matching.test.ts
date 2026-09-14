import { describe, expect, it } from 'vitest';
import { kviusSignature, sameKvius } from '../src/hebrewCalendar.js';
import { MAX_HISTORICAL_YEAR, MIN_HISTORICAL_YEAR, findMatchingYears, findPartialWeekMatches, weekMatchesInYear } from '../src/matching.js';
import type { WeekDay } from '../src/types.js';

/** 10-16 Shevat 5786 (a real week, verified against a direct HDate scan - see the PR this landed in) - deliberately away from the Rosh Hashana/Cheshvan-Kislev boundary so it's a clean, ordinary 7-day week with no year-rollover edge case. */
const SHEVAT_5786_WEEK: WeekDay[] = [
  { month: 11, day: 7 },
  { month: 11, day: 8 },
  { month: 11, day: 9 },
  { month: 11, day: 10 },
  { month: 11, day: 11 },
  { month: 11, day: 12 },
  { month: 11, day: 13 },
];

describe('findMatchingYears', () => {
  it('only returns years whose signature matches the target', () => {
    const targetYear = 5786;
    const targetSig = kviusSignature(targetYear);
    const results = findMatchingYears(targetYear, { fromYear: 5700, toYear: 5850 });
    expect(results.length).toBeGreaterThan(0);
    for (const { hebrewYear } of results) {
      expect(sameKvius(kviusSignature(hebrewYear), targetSig)).toBe(true);
    }
  });

  it('excludes the target year by default and includes it (distance 0) when requested', () => {
    const targetYear = 5742;
    const withoutTarget = findMatchingYears(targetYear, { fromYear: 5735, toYear: 5745 });
    expect(withoutTarget.some((r) => r.hebrewYear === targetYear)).toBe(false);

    const withTarget = findMatchingYears(targetYear, { fromYear: 5735, toYear: 5745, includeTarget: true });
    const self = withTarget.find((r) => r.hebrewYear === targetYear);
    expect(self).toBeDefined();
    expect(self?.distance).toBe(0);
  });

  it('sorts by distance from the target year, nearest first', () => {
    const results = findMatchingYears(5786, { fromYear: 5700, toYear: 5850 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.distance).toBeGreaterThanOrEqual(results[i - 1]!.distance);
    }
  });

  it('rejects an inverted range', () => {
    expect(() => findMatchingYears(5786, { fromYear: 5800, toYear: 5700 })).toThrow(RangeError);
  });

  it('kvius cycles recur roughly every ~28 years on average across a long span (sanity, not exact)', () => {
    // With 14 possible keviyot, a given signature should recur multiple times over 200 years.
    // Needs allowOutOfHistoricalRange since this is a claim about the calendar math
    // itself, not about what the real catalog happens to cover.
    const results = findMatchingYears(5786, { fromYear: 5600, toYear: 5800, allowOutOfHistoricalRange: true });
    expect(results.length).toBeGreaterThan(3);
  });

  it('defaults to [MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR] - the real catalog span - when no range is given', () => {
    const results = findMatchingYears(5786);
    for (const { hebrewYear } of results) {
      expect(hebrewYear).toBeGreaterThanOrEqual(MIN_HISTORICAL_YEAR);
      expect(hebrewYear).toBeLessThanOrEqual(MAX_HISTORICAL_YEAR);
    }
    // Verified directly against packages/mafteiach-index's real database:
    // coverage before 5710 is sparse (1-14 occasions/year) - it predates
    // the Rebbe's own Sichos Kodesh, so MIN_HISTORICAL_YEAR is 5710, not
    // the dataset's earliest crawled year (5690).
    expect(results.map((r) => r.hebrewYear)).toEqual([5742, 5735, 5715]);
  });

  it('clamps an explicit out-of-range window to the historical range by default', () => {
    const wide = findMatchingYears(5786, { fromYear: 5600, toYear: 5850 });
    expect(wide.map((r) => r.hebrewYear)).toEqual([5742, 5735, 5715]);
    // 5769 kvius-matches 5786 too, but it's outside the catalog's range and must not appear.
    expect(wide.some((r) => r.hebrewYear === 5769)).toBe(false);
  });

  it('allowOutOfHistoricalRange lets a caller search past the catalog bounds on purpose', () => {
    const results = findMatchingYears(5786, { fromYear: 5600, toYear: 5850, allowOutOfHistoricalRange: true });
    expect(results.some((r) => r.hebrewYear === 5769)).toBe(true);
    expect(results.some((r) => r.hebrewYear < MIN_HISTORICAL_YEAR)).toBe(true);
  });

  it('returns an empty list, not an error, when the requested range falls entirely outside the historical bounds', () => {
    expect(findMatchingYears(5786, { fromYear: 5800, toYear: 5850 })).toEqual([]);
  });
});

describe('weekMatchesInYear', () => {
  it('a year kvius-matches itself trivially (the week translates back onto itself)', () => {
    expect(weekMatchesInYear(5786, SHEVAT_5786_WEEK)).toBe(true);
  });

  it('is true for a year that is a full kvius match too (a full match implies every week matches)', () => {
    for (const year of [5715, 5735, 5742]) {
      expect(sameKvius(kviusSignature(year), kviusSignature(5786))).toBe(true);
      expect(weekMatchesInYear(year, SHEVAT_5786_WEEK)).toBe(true);
    }
  });

  it('is true for a year that matches this specific week without being a full kvius match', () => {
    expect(sameKvius(kviusSignature(5711), kviusSignature(5786))).toBe(false);
    expect(weekMatchesInYear(5711, SHEVAT_5786_WEEK)).toBe(true);
  });

  it('is false for a year where the days do not land on a real, consecutive Sunday-Saturday week', () => {
    expect(weekMatchesInYear(5710, SHEVAT_5786_WEEK)).toBe(false);
  });

  it('is false for an empty days array', () => {
    expect(weekMatchesInYear(5786, [])).toBe(false);
  });

  it('is false when the (month, day) pair does not really exist in candidateYear (HDate silently rolls over rather than throwing)', () => {
    // Cheshvan 30 only exists in a "shalem" year; rolls into Kislev 1 otherwise instead of throwing.
    expect(weekMatchesInYear(5786, [{ month: 8, day: 30 }])).toBe(false);
  });
});

describe('findPartialWeekMatches', () => {
  it('excludes full kvius matches (those are findMatchingYears territory) but includes weaker week-only matches', () => {
    const results = findPartialWeekMatches(5786, SHEVAT_5786_WEEK, { fromYear: 5710, toYear: 5752 });
    expect(results.map((r) => r.hebrewYear).sort((a, b) => a - b)).toEqual([5711, 5712, 5725, 5729, 5732, 5738, 5739, 5752]);
    for (const fullMatchYear of [5715, 5735, 5742]) {
      expect(results.some((r) => r.hebrewYear === fullMatchYear)).toBe(false);
    }
  });

  it('sorts by distance from the target year, nearest first', () => {
    const results = findPartialWeekMatches(5786, SHEVAT_5786_WEEK, { fromYear: 5710, toYear: 5752 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.distance).toBeGreaterThanOrEqual(results[i - 1]!.distance);
    }
  });

  it('defaults to [MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR] when no range is given', () => {
    const results = findPartialWeekMatches(5786, SHEVAT_5786_WEEK);
    for (const { hebrewYear } of results) {
      expect(hebrewYear).toBeGreaterThanOrEqual(MIN_HISTORICAL_YEAR);
      expect(hebrewYear).toBeLessThanOrEqual(MAX_HISTORICAL_YEAR);
    }
  });

  it('rejects an inverted range', () => {
    expect(() => findPartialWeekMatches(5786, SHEVAT_5786_WEEK, { fromYear: 5800, toYear: 5700 })).toThrow(RangeError);
  });

  it('returns an empty list, not an error, for an empty days array', () => {
    expect(findPartialWeekMatches(5786, [])).toEqual([]);
  });
});
