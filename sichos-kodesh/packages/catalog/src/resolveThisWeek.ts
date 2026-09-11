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
 * The one week a year that straddles Rosh Hashana is a real exception to
 * that direct-translation trick: `sourceYear` is only kvius-matched to
 * *this* Hebrew year, not necessarily to the next one, so a day that has
 * already rolled into the new Hebrew year has no well-defined day in
 * `sourceYear` to borrow - translating it naively would silently pull in
 * an unrelated date a full year off in `sourceYear` (e.g. mapping the new
 * Rosh Hashana onto `sourceYear`'s *own*, entirely different, Rosh
 * Hashana). Those days are skipped rather than mismatched; the caller can
 * always look up the new year's own matched source year for what comes
 * after.
 *
 * Shared by apps/mobile and apps/web - both need the identical
 * kvius-to-catalog resolution, not two independently-maintained copies.
 */
export function resolveThisWeek(sourceYear: number, catalog: CatalogByYear, today: Date = new Date()): WeekOccasion[] {
  const todayH = new HDate(today);
  const targetYear = todayH.getFullYear();
  const weekEndH = todayH.onOrAfter(6); // Shabbos on or after today.
  const weekEndAbs = weekEndH.abs();
  const weekStartAbs = weekEndAbs - 6; // The preceding Sunday.

  const sourceEntries = catalog[sourceYear] ?? [];
  const results: WeekOccasion[] = [];

  for (let abs = weekStartAbs; abs <= weekEndAbs; abs++) {
    const dayH = new HDate(abs);
    if (dayH.getFullYear() !== targetYear) continue; // Crosses into an adjacent Hebrew year - see above.
    const hebrewDate = toMafteiachHebrewDateKey({ year: sourceYear, month: dayH.getMonth(), day: dayH.getDate() });
    const gregorianDate = dayH.greg().toISOString().slice(0, 10);
    for (const entry of sourceEntries) {
      if (entry.hebrewDate === hebrewDate && entryHasContent(entry)) {
        results.push({ hebrewDate, gregorianDate, entry });
      }
    }
  }

  return results;
}
