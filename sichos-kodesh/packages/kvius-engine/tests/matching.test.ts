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
    const targetYear = 5786;
    const withoutTarget = findMatchingYears(targetYear, { fromYear: 5780, toYear: 5790 });
    expect(withoutTarget.some((r) => r.hebrewYear === targetYear)).toBe(false);

    const withTarget = findMatchingYears(targetYear, { fromYear: 5780, toYear: 5790, includeTarget: true });
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
    const results = findMatchingYears(5786, { fromYear: 5600, toYear: 5800 });
    expect(results.length).toBeGreaterThan(3);
  });
});
