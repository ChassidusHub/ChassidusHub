import { HDate } from '@hebcal/core';
import { entryHasContent } from './catalogLookup.js';
import type { CatalogByYear } from './catalogLookup.js';
import { toMafteiachHebrewDateKey } from './hebrewDateKey.js';
import type { CatalogEntry } from './types.js';

export interface WeekOccasion {
  /** Raw mafteiach-index date key, in `sourceYear` - see `toMafteiachHebrewDateKey`. */
  hebrewDate: string;
  /** The real, current-week Gregorian date this occasion's weekday falls on. */
  gregorianDate: string;
  entry: CatalogEntry;
}

interface WeekDay {
  month: number;
  day: number;
  gregorianDate: string;
}

/**
 * The current Hebrew week's (Sunday through Shabbos) days, as bare
 * (month, day) pairs plus the real Gregorian date each one falls on - not
 * translated into any particular year yet, since `resolveThisWeek` and
 * `resolveThisWeekAllYears` each translate them differently (one source
 * year vs. every indexed year).
 *
 * A day that's already rolled into the *next* Hebrew year (the one week a
 * year this can happen: the week straddling Rosh Hashana) is skipped
 * rather than included under the new year's month/day values - shared by
 * both callers for one consistent definition of "this week," even though
 * only `resolveThisWeek`'s original reason for the skip (avoiding
 * misattributing a translated date onto `sourceYear`'s own, unrelated
 * same-month-day date a full year earlier) strictly applies to it.
 */
function thisWeekDays(today: Date): WeekDay[] {
  const todayH = new HDate(today);
  const targetYear = todayH.getFullYear();
  const weekEndH = todayH.onOrAfter(6); // Shabbos on or after today.
  const weekEndAbs = weekEndH.abs();
  const weekStartAbs = weekEndAbs - 6; // The preceding Sunday.

  const days: WeekDay[] = [];
  for (let abs = weekStartAbs; abs <= weekEndAbs; abs++) {
    const dayH = new HDate(abs);
    if (dayH.getFullYear() !== targetYear) continue; // Crosses into an adjacent Hebrew year - see above.
    days.push({ month: dayH.getMonth(), day: dayH.getDate(), gregorianDate: dayH.greg().toISOString().slice(0, 10) });
  }
  return days;
}

/**
 * Every occasion with real content (audio or a PDF) that falls anywhere in
 * the current Hebrew week (Sunday through Shabbos) - not Shabbos alone.
 * Farbrengens happened on weekdays as often as on Shabbos (Yud-Tes Kislev,
 * Yud Shevat, Yud-Beis Tammuz...), and a Shabbos-only view was hiding all
 * of them.
 *
 * Two kvius-matched years share identical leap status and month-length
 * pattern (that's the definition of a kvius match - see `sameKvius` in
 * kvius-engine's `hebrewCalendar.ts`), so a given Hebrew (month, day) is
 * always the same number of days after Tishrei 1 in both years, and -
 * combined with their matching Rosh Hashana weekday - always falls on the
 * same weekday too. That means this week's dates translate directly into
 * `sourceYear` by reusing the same month/day values as-is: no per-occasion
 * engine matching (`buildMatchedSchedule`/`FixedOccasionDef`) is needed,
 * just a day-by-day catalog lookup - and it naturally covers weekday
 * farbrengens and Shabbos identically, since the catalog only ever
 * contains days with a real recorded occasion.
 *
 * Shared by apps/mobile and apps/web - both need the identical
 * kvius-to-catalog resolution, not two independently-maintained copies.
 */
export function resolveThisWeek(sourceYear: number, catalog: CatalogByYear, today: Date = new Date()): WeekOccasion[] {
  const sourceEntries = catalog[sourceYear] ?? [];
  const results: WeekOccasion[] = [];

  for (const { month, day, gregorianDate } of thisWeekDays(today)) {
    const hebrewDate = toMafteiachHebrewDateKey({ year: sourceYear, month, day });
    for (const entry of sourceEntries) {
      if (entry.hebrewDate === hebrewDate && entryHasContent(entry)) {
        results.push({ hebrewDate, gregorianDate, entry });
      }
    }
  }

  return results;
}

export interface YearWeekOccasions {
  hebrewYear: number;
  entries: CatalogEntry[];
}

/**
 * Every occasion, across *every* indexed Hebrew year - not just years
 * kvius-matched to the current one - that falls on the same Hebrew
 * calendar (month, day) as some day in the current week. Unlike
 * `resolveThisWeek`, this doesn't need or use weekday alignment: it
 * answers "what happened on these Hebrew dates across all our history,"
 * not "what happened this same week, in a year whose calendar lines up
 * with this one." A kvius-matched year's own occasion is naturally
 * included too - it's still an occasion on one of these dates - so
 * there's no need to cross-reference `findMatchingYears` here at all.
 *
 * Grouped by year (years with nothing this week omitted), most recent
 * year first - a real Gregorian date isn't included per entry the way
 * `resolveThisWeek`'s is, since a historical year's actual occurrence
 * almost never falls on today's real Gregorian date and showing it would
 * misleadingly suggest otherwise; `entry.occasionLabel`/`hebrewDate`
 * already carry the real Hebrew date.
 */
export function resolveThisWeekAllYears(catalog: CatalogByYear, today: Date = new Date()): YearWeekOccasions[] {
  const days = thisWeekDays(today);
  const years = Object.keys(catalog)
    .map(Number)
    .sort((a, b) => b - a);

  const results: YearWeekOccasions[] = [];
  for (const year of years) {
    const yearEntries = catalog[year] ?? [];
    const entries: CatalogEntry[] = [];
    for (const { month, day } of days) {
      const hebrewDate = toMafteiachHebrewDateKey({ year, month, day });
      for (const entry of yearEntries) {
        if (entry.hebrewDate === hebrewDate && entryHasContent(entry)) {
          entries.push(entry);
        }
      }
    }
    if (entries.length > 0) results.push({ hebrewYear: year, entries });
  }
  return results;
}
