import { describe, expect, it } from 'vitest';
import { buildMatchedSchedule } from '../src/buildMatchedSchedule.js';
import { findMatchingYears } from '../src/matching.js';

const TARGET_YEAR = 5786;

function firstMatch(): number {
  const [match] = findMatchingYears(TARGET_YEAR, { fromYear: 5700, toYear: 5785 });
  if (!match) throw new Error('no matching year found in fixture range');
  return match.hebrewYear;
}

describe('buildMatchedSchedule', () => {
  it('throws when sourceYear is not kvius-matched to targetYear', () => {
    expect(() =>
      buildMatchedSchedule(TARGET_YEAR, TARGET_YEAR - 1, { il: false, gapStrategy: 'skip', hasRecording: () => true }),
    ).toThrow(RangeError);
  });

  it('throws when nearestKviusYear is requested without a matchingYearsRange', () => {
    const sourceYear = firstMatch();
    expect(() =>
      buildMatchedSchedule(TARGET_YEAR, sourceYear, { il: false, gapStrategy: 'nearestKviusYear', hasRecording: () => true }),
    ).toThrow(RangeError);
  });

  it('resolves every week to the source year when the catalog has full coverage', () => {
    const sourceYear = firstMatch();
    const schedule = buildMatchedSchedule(TARGET_YEAR, sourceYear, {
      il: false,
      gapStrategy: 'skip',
      hasRecording: () => true,
    });
    expect(schedule.weekly.length).toBeGreaterThan(0);
    for (const entry of schedule.weekly) {
      expect(entry.resolution).toEqual({ status: 'primary', resolvedYear: sourceYear });
    }
  });

  it('reports gaps for weeks missing from a sparse catalog under "skip"', () => {
    const sourceYear = firstMatch();
    const schedule = buildMatchedSchedule(TARGET_YEAR, sourceYear, {
      il: false,
      gapStrategy: 'skip',
      hasRecording: (year, occasionKey) => occasionKey !== 'week:0',
    });
    const week0 = schedule.weekly.find((w) => w.occasionKey === 'week:0');
    expect(week0?.resolution).toEqual({ status: 'gap', resolvedYear: null });
    expect(schedule.weekly.filter((w) => w.occasionKey !== 'week:0').every((w) => w.resolution.status === 'primary')).toBe(
      true,
    );
  });

  it('falls back to another kvius-matched year for a gap under "nearestKviusYear"', () => {
    const matches = findMatchingYears(TARGET_YEAR, { fromYear: 5700, toYear: 5785 });
    expect(matches.length).toBeGreaterThan(1);
    const sourceYear = matches[0]!.hebrewYear;
    const fallbackYear = matches[1]!.hebrewYear;
    const schedule = buildMatchedSchedule(TARGET_YEAR, sourceYear, {
      il: false,
      gapStrategy: 'nearestKviusYear',
      matchingYearsRange: { fromYear: 5700, toYear: 5785 },
      hasRecording: (year, occasionKey) => (occasionKey === 'week:0' ? year === fallbackYear : year === sourceYear),
    });
    const week0 = schedule.weekly.find((w) => w.occasionKey === 'week:0');
    expect(week0?.resolution).toEqual({ status: 'fallback', resolvedYear: fallbackYear });
  });

  it('includes resolved fixed-date occasions alongside the weekly schedule', () => {
    const sourceYear = firstMatch();
    const schedule = buildMatchedSchedule(TARGET_YEAR, sourceYear, {
      il: false,
      gapStrategy: 'skip',
      hasRecording: () => true,
      fixedOccasions: [{ key: 'yud-tes-kislev', label: 'Yud-Tes Kislev', day: 19, month: 9 }],
    });
    expect(schedule.fixedDate).toHaveLength(1);
    expect(schedule.fixedDate[0]!.resolution).toEqual({ status: 'primary', resolvedYear: sourceYear });
    expect(schedule.fixedDate[0]!.hebrewDate).toEqual({ year: TARGET_YEAR, month: 9, day: 19 });
  });
});
