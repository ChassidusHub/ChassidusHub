import { HDate } from '@hebcal/core';
import { getYearSedra, kviusSignature, sameKvius } from './hebrewCalendar.js';
import type { MatchingYearResult, MatchingYearsOptions, WeekDay } from './types.js';

/**
 * Hebrew year bounds of the Sichos Kodesh catalog this app is built from:
 * `packages/mafteiach-index`'s crawled dataset. MAX is the dataset's last
 * year. MIN is 5710, not the dataset's earliest year (5690): coverage
 * before 5710 is sparse (1-14 occasions/year vs. 36+ starting at 5710),
 * predating the Rebbe's own Sichos Kodesh that this app is about. A kvius
 * match outside this range can never resolve to a real recording, so
 * `findMatchingYears` clamps to it by default - otherwise the year picker
 * would routinely offer years guaranteed to be a gap.
 */
export const MIN_HISTORICAL_YEAR = 5710;
export const MAX_HISTORICAL_YEAR = 5752;

function resolveYearRange(options: MatchingYearsOptions): { fromYear: number; toYear: number } | null {
  const { fromYear = MIN_HISTORICAL_YEAR, toYear = MAX_HISTORICAL_YEAR, allowOutOfHistoricalRange = false } = options;
  if (fromYear > toYear) {
    throw new RangeError(`fromYear (${fromYear}) must be <= toYear (${toYear})`);
  }
  const effectiveFromYear = allowOutOfHistoricalRange ? fromYear : Math.max(fromYear, MIN_HISTORICAL_YEAR);
  const effectiveToYear = allowOutOfHistoricalRange ? toYear : Math.min(toYear, MAX_HISTORICAL_YEAR);
  return effectiveFromYear > effectiveToYear ? null : { fromYear: effectiveFromYear, toYear: effectiveToYear };
}

/**
 * Scans [fromYear, toYear] for Hebrew years whose kviah matches
 * `targetYear`'s, sorted nearest-first. This is the "which historical
 * years can I follow along with" list a user picks a source year from.
 *
 * Defaults to, and clamps any explicit range to, [MIN_HISTORICAL_YEAR,
 * MAX_HISTORICAL_YEAR] - pass `allowOutOfHistoricalRange: true` to search
 * outside the real catalog's coverage (e.g. for testing the engine's
 * calendar math itself, independent of what's actually catalogued).
 */
export function findMatchingYears(targetYear: number, options: MatchingYearsOptions = {}): MatchingYearResult[] {
  const range = resolveYearRange(options);
  if (!range) return [];
  const { includeTarget = false } = options;

  const targetSig = kviusSignature(targetYear);
  const results: MatchingYearResult[] = [];
  for (let year = range.fromYear; year <= range.toYear; year++) {
    if (year === targetYear && !includeTarget) continue;
    if (sameKvius(kviusSignature(year), targetSig)) {
      results.push({ hebrewYear: year, distance: Math.abs(year - targetYear) });
    }
  }
  results.sort((a, b) => a.distance - b.distance || a.hebrewYear - b.hebrewYear);
  return results;
}

/**
 * Whether `days`' (month, day) pairs - typically one real week's worth,
 * Sunday through Shabbos, in some other "target" year - translate
 * directly into `candidateYear` (same month/day values, reusing them
 * as-is - the same translation `findMatchingYears`' full match relies on)
 * and land on a real, *consecutive* Sunday-through-Shabbos week there
 * too. A full kvius match (`sameKvius`) always satisfies this for every
 * week of the year, by construction; this is for the narrower, weaker
 * claim - a year that isn't a full match overall can still happen to
 * stay in sync for one specific week.
 *
 * `new HDate(day, month, candidateYear)` doesn't throw for a (month, day)
 * that doesn't really exist in `candidateYear` (e.g. day 30 of a month
 * that's only 29 days long there, or Adar II in a non-leap year) - it
 * silently rolls over into a different real date instead (e.g. Cheshvan
 * 30 in a 29-day Cheshvan year rolls into Kislev 1; Adar II in a non-leap
 * year rolls into plain Adar), so every date is re-checked against the
 * (month, day) it was actually asked for, not just trusted to exist.
 */
export function weekMatchesInYear(candidateYear: number, days: WeekDay[]): boolean {
  if (days.length === 0) return false;
  let prevAbs: number | null = null;
  let firstWeekday: number | null = null;
  for (const { month, day } of days) {
    const hdate = new HDate(day, month, candidateYear);
    if (hdate.getMonth() !== month || hdate.getDate() !== day) return false; // rolled over - doesn't really exist in candidateYear
    const abs = hdate.abs();
    if (prevAbs !== null && abs !== prevAbs + 1) return false; // not consecutive days
    if (firstWeekday === null) firstWeekday = hdate.getDay();
    prevAbs = abs;
  }
  return firstWeekday === 0; // must start on a Sunday to be a real Sun-Sat week, not just some other run of consecutive days
}

/**
 * The parsha (or `null` for a holiday week) `candidateYear`'s own Sedra
 * schedule assigns to `shabbos` - `il` matters here even though it plays
 * no part in `weekMatchesInYear`'s own date-alignment check, since which
 * parsha falls on a given Shabbos genuinely differs between the Diaspora
 * and Israel reading schedules.
 */
function shabbosParsha(candidateYear: number, shabbos: WeekDay, il: boolean): string[] | null {
  const hdate = new HDate(shabbos.day, shabbos.month, candidateYear);
  const result = getYearSedra(candidateYear, il).lookup(hdate);
  return result.chag ? null : result.parsha;
}

function sameParshaList(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((parsha, i) => parsha === b[i]);
}

/**
 * Years that stay in sync for `days` (typically "this week," from
 * `resolveThisWeek`'s week-day helper) without being a full kvius match
 * overall (see `weekMatchesInYear`) - years already reported by
 * `findMatchingYears` for `targetYear` are excluded, since those satisfy
 * this trivially for every week and are meant to be shown separately, as
 * the primary match. Same scanning/range/sorting behavior as
 * `findMatchingYears` otherwise.
 *
 * `weekMatchesInYear`'s own date-alignment check is necessary but not
 * sufficient: it only confirms `days`' (month, day) pairs land on a real,
 * consecutive Sunday-Shabbos week in the candidate year, not that the
 * candidate's *parsha* for that Shabbos actually matches the target
 * year's - two years can stay in sync for one specific week's raw dates
 * while their annual reading cycles are offset by a parsha or more (e.g.
 * from an earlier doubled/undoubled reading elsewhere in the year), so
 * this only accepts a candidate whose own Sedra schedule assigns the
 * *same* parsha to that Shabbos - the actual point of a "which year can I
 * follow this week's farbrengen in" match.
 */
export function findPartialWeekMatches(targetYear: number, days: WeekDay[], il: boolean, options: MatchingYearsOptions = {}): MatchingYearResult[] {
  const range = resolveYearRange(options);
  if (!range) return [];
  const { includeTarget = false } = options;
  const shabbos = days[days.length - 1];
  const targetParsha = shabbos ? shabbosParsha(targetYear, shabbos, il) : null;

  const targetSig = kviusSignature(targetYear);
  const results: MatchingYearResult[] = [];
  for (let year = range.fromYear; year <= range.toYear; year++) {
    if (year === targetYear && !includeTarget) continue;
    if (sameKvius(kviusSignature(year), targetSig)) continue; // a full match - findMatchingYears already reports it
    if (!weekMatchesInYear(year, days)) continue;
    if (shabbos && !sameParshaList(shabbosParsha(year, shabbos, il), targetParsha)) continue;
    results.push({ hebrewYear: year, distance: Math.abs(year - targetYear) });
  }
  results.sort((a, b) => a.distance - b.distance || a.hebrewYear - b.hebrewYear);
  return results;
}
