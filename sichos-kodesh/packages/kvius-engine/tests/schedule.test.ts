import { describe, expect, it } from 'vitest';
import { findMatchingYears } from '../src/matching.js';
import { buildFixedDateSchedule, buildWeeklySchedule } from '../src/schedule.js';
import { HDate } from '@hebcal/core';

describe('buildWeeklySchedule', () => {
  it('produces one entry per Shabbat of the year, roughly 50-55 weeks', () => {
    const weeks = buildWeeklySchedule(5786, false);
    expect(weeks.length).toBeGreaterThanOrEqual(50);
    expect(weeks.length).toBeLessThanOrEqual(56);
  });

  it('every entry has either a parsha or a displacing holiday, never both or neither', () => {
    for (const week of buildWeeklySchedule(5786, false)) {
      const hasParsha = week.parsha !== null;
      const hasHoliday = week.holiday !== null;
      expect(hasParsha).toBe(!hasHoliday);
    }
  });

  it('week indices are 0-based and contiguous', () => {
    const weeks = buildWeeklySchedule(5786, false);
    weeks.forEach((w, i) => expect(w.weekIndex).toBe(i));
  });

  it('kvius-matched years produce structurally identical schedules (same length, same parsha/holiday sequence)', () => {
    const targetYear = 5786;
    const [firstMatch] = findMatchingYears(targetYear, { fromYear: 5700, toYear: 5785 });
    expect(firstMatch).toBeDefined();
    const targetWeeks = buildWeeklySchedule(targetYear, false);
    const matchWeeks = buildWeeklySchedule(firstMatch!.hebrewYear, false);
    expect(matchWeeks.length).toBe(targetWeeks.length);
    for (let i = 0; i < targetWeeks.length; i++) {
      expect(matchWeeks[i]!.parsha).toEqual(targetWeeks[i]!.parsha);
      expect(matchWeeks[i]!.holiday).toEqual(targetWeeks[i]!.holiday);
    }
  });

  it('a non-matching year generally diverges somewhere in its parsha/holiday sequence', () => {
    const targetYear = 5786;
    const targetSig = buildWeeklySchedule(targetYear, false);
    // Walk backward until we find *some* year without a matching signature to compare against.
    const matches = new Set(findMatchingYears(targetYear, { fromYear: 5770, toYear: 5785 }).map((r) => r.hebrewYear));
    const nonMatchYear = [...Array(15).keys()].map((i) => targetYear - 1 - i).find((y) => !matches.has(y))!;
    const otherSig = buildWeeklySchedule(nonMatchYear, false);
    const identical =
      otherSig.length === targetSig.length &&
      otherSig.every((w, i) => JSON.stringify(w.parsha) === JSON.stringify(targetSig[i]!.parsha));
    expect(identical).toBe(false);
  });
});

describe('buildFixedDateSchedule', () => {
  it('resolves a literal month/day occasion to the requested Hebrew date', () => {
    const [entry] = buildFixedDateSchedule(5786, [{ key: 'yud-tes-kislev', label: 'Yud-Tes Kislev', day: 19, month: 9 }]);
    expect(entry!.hebrewDate).toEqual({ year: 5786, month: 9, day: 19 });
    expect(entry!.gregorianDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('resolves an Adar-anchored occasion to Adar II in a leap year and Adar in a common year', () => {
    const leapYear = 5784; // known leap year
    const commonYear = 5785; // known common year
    const purim: Parameters<typeof buildFixedDateSchedule>[1] = [
      { key: 'purim', label: 'Purim', day: 14, month: (y) => (HDate.isLeapYear(y) ? 13 : 12) },
    ];
    expect(buildFixedDateSchedule(leapYear, purim)[0]!.hebrewDate.month).toBe(13);
    expect(buildFixedDateSchedule(commonYear, purim)[0]!.hebrewDate.month).toBe(12);
  });
});
