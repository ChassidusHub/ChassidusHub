import { describe, expect, it } from 'vitest';
import { kviusSignature, sameKvius } from '../src/hebrewCalendar.js';
import { findMatchingYears } from '../src/matching.js';

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
    const withoutTarget = findMatchingYears(targetYear, { fromYear: 5730, toYear: 5752 });
    expect(withoutTarget.some((r) => r.hebrewYear === targetYear)).toBe(false);

    const withTarget = findMatchingYears(targetYear, { fromYear: 5730, toYear: 5752, includeTarget: true });
    const self = withTarget.find((r) => r.hebrewYear === targetYear);
    expect(self).toBeDefined();
    expect(self?.distance).toBe(0);
  });

  it('starts at 5710 by default since the Rebbe\'s Nesius begins in 5710', () => {
    const results = findMatchingYears(5786);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.hebrewYear).toBeGreaterThanOrEqual(5710);
      expect(r.hebrewYear).toBeLessThanOrEqual(5752);
    }
    // For 5786 (גכה), historical matches during the Rebbe's Nesius (5710-5752):
    // 5742, 5735, 5715
    const years = results.map((r) => r.hebrewYear);
    expect(years).toEqual([5742, 5735, 5715]);

    // Pre-5710 years (e.g. 5691, 5688) are omitted by default even if fromYear is lower
    const withLowerFromYear = findMatchingYears(5786, { fromYear: 5600 });
    expect(withLowerFromYear.every((r) => r.hebrewYear >= 5710)).toBe(true);

    // Unless allowPre5710 is explicitly enabled
    const withPre5710 = findMatchingYears(5786, { fromYear: 5600, allowPre5710: true });
    expect(withPre5710.some((r) => r.hebrewYear < 5710)).toBe(true);
  });

  it('stops at 5752 by default since Sichos Kodesh recordings end in 5752', () => {
    const results = findMatchingYears(5786, { fromYear: 5710, toYear: 5785 });
    for (const r of results) {
      expect(r.hebrewYear).toBeLessThanOrEqual(5752);
      expect(r.hebrewYear).toBeGreaterThanOrEqual(5710);
    }
    // For 5786 (גכה), the nearest match in the historical Sichos Kodesh era is 5742
    expect(results[0]?.hebrewYear).toBe(5742);

    // If allowPost5752 is set, 5769 can be returned
    const futureResults = findMatchingYears(5786, { fromYear: 5710, toYear: 5785, allowPost5752: true });
    expect(futureResults[0]?.hebrewYear).toBe(5769);
  });

  it('sorts by distance from the target year, nearest first', () => {
    const results = findMatchingYears(5786, { fromYear: 5710, toYear: 5850 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.distance).toBeGreaterThanOrEqual(results[i - 1]!.distance);
    }
  });

  it('rejects an inverted range', () => {
    expect(() => findMatchingYears(5786, { fromYear: 5800, toYear: 5700 })).toThrow(RangeError);
  });

  it('kvius cycles recur roughly every ~28 years on average across a long span (sanity, not exact)', () => {
    // With 14 possible keviyot, a given signature should recur multiple times over 200 years.
    const results = findMatchingYears(5786, { fromYear: 5600, toYear: 5800, allowPre5710: true, allowPost5752: true });
    expect(results.length).toBeGreaterThan(3);
  });
});
