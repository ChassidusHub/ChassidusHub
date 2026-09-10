import { HDate, parshiot } from '@hebcal/core';
import { getYearSedra } from './hebrewCalendar.js';
import type { FixedDateOccasion, FixedOccasionDef, HebrewDateParts, WeeklyOccasion } from './types.js';

/** Stable catalog/gap-resolution key for a weekly occasion. */
export function weeklyOccasionKey(weekIndex: number): string {
  return `week:${weekIndex}`;
}

function toDateParts(hdate: HDate): HebrewDateParts {
  return { year: hdate.getFullYear(), month: hdate.getMonth(), day: hdate.getDate() };
}

function toISODate(hdate: HDate): string {
  return hdate.greg().toISOString().slice(0, 10);
}

/**
 * Builds the week-by-week Shabbos schedule for a Hebrew year: one entry
 * per Shabbat from Rosh Hashana through the following Elul, each carrying
 * its parsha (or the holiday that displaced it). Because the Sedra
 * algorithm is driven entirely by a year's kviah plus the `il` flag, two
 * kvius-matched years (see {@link import('./hebrewCalendar.js').sameKvius})
 * produce arrays of identical length and identical parsha/holiday
 * sequence — only the Gregorian dates differ. That's what makes
 * `weekIndex` a valid cross-year matching key.
 */
export function buildWeeklySchedule(hebrewYear: number, il: boolean): WeeklyOccasion[] {
  const sedra = getYearSedra(hebrewYear, il);
  const sedraArray = sedra.getSedraArray();
  const firstSaturday = sedra.getFirstSaturday();
  return sedraArray.map((entry, weekIndex) => {
    const hdate = new HDate(firstSaturday + weekIndex * 7);
    const isHoliday = typeof entry === 'string';
    // Index is guaranteed in-range by Sedra.getSedraArray()'s contract (a valid 0-based parsha index).
    const parsha = isHoliday ? null : entry < 0 ? [parshiot[-entry]!, parshiot[-entry + 1]!] : [parshiot[entry]!];
    return {
      kind: 'weekly',
      weekIndex,
      hebrewDate: toDateParts(hdate),
      gregorianDate: toISODate(hdate),
      parsha,
      holiday: isHoliday ? entry : null,
    };
  });
}

/**
 * Resolves each fixed-date occasion definition to its actual date in a
 * given Hebrew year. `def.month` may be a resolver function so
 * Adar-anchored occasions land on the year's real Adar (Adar II in a leap
 * year, plain Adar otherwise) without the caller special-casing leap years.
 */
export function buildFixedDateSchedule(hebrewYear: number, occasions: FixedOccasionDef[]): FixedDateOccasion[] {
  return occasions.map((def) => {
    const month = typeof def.month === 'function' ? def.month(hebrewYear) : def.month;
    const hdate = new HDate(def.day, month, hebrewYear);
    return {
      kind: 'fixedDate',
      occasionKey: def.key,
      label: def.label,
      hebrewDate: toDateParts(hdate),
      gregorianDate: toISODate(hdate),
    };
  });
}
