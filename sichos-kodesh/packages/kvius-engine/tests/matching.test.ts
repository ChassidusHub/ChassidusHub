import { describe, expect, it } from 'vitest';
import { kviusSignature, sameKvius } from '../src/hebrewCalendar.js';
import { MAX_HISTORICAL_YEAR, MIN_HISTORICAL_YEAR, findMatchingYears } from '../src/matching.js';

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
