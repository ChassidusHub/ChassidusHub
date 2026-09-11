import { kviusSignature, sameKvius } from './hebrewCalendar.js';
import type { MatchingYearResult, MatchingYearsOptions } from './types.js';

/**
 * The beginning Hebrew year of the Lubavitcher Rebbe's Nesius (5710 / 1950).
 * Recorded Sichos Kodesh and Farbrengens of the Rebbe begin in 5710.
 * Historical kvius matching starts at 5710.
 */
export const MIN_HISTORICAL_YEAR = 5710;

/**
 * The final Hebrew year of the Lubavitcher Rebbe's public Sichos Kodesh / Farbrengens (5752 / 1992).
 * Historical matching stops at this year because no later recorded Sichos exist.
 */
export const MAX_HISTORICAL_YEAR = 5752;

/**
 * Scans [fromYear, toYear] for Hebrew years whose kviah matches
 * `targetYear`'s, sorted nearest-first. This is the "which historical
 * years can I follow along with" list a user picks a source year from.
 *
 * Starts at 5710 (MIN_HISTORICAL_YEAR) and stops at 5752 (MAX_HISTORICAL_YEAR)
 * by default, since the recorded Sichos Kodesh catalog spans 5710-5752.
 * Pass `allowPre5710: true` or `allowPost5752: true` to bypass.
 */
export function findMatchingYears(targetYear: number, options: MatchingYearsOptions = {}): MatchingYearResult[] {
  const {
    fromYear = MIN_HISTORICAL_YEAR,
    toYear = MAX_HISTORICAL_YEAR,
    includeTarget = false,
    allowPost5752 = false,
    allowPre5710 = false,
  } = options;
  if (fromYear > toYear) {
    throw new RangeError(`fromYear (${fromYear}) must be <= toYear (${toYear})`);
  }
  const effectiveFromYear = allowPre5710 ? fromYear : Math.max(fromYear, MIN_HISTORICAL_YEAR);
  const effectiveToYear = allowPost5752 ? toYear : Math.min(toYear, MAX_HISTORICAL_YEAR);

  if (effectiveFromYear > effectiveToYear) {
    return [];
  }
  const targetSig = kviusSignature(targetYear);
  const results: MatchingYearResult[] = [];
  for (let year = effectiveFromYear; year <= effectiveToYear; year++) {
    if (year === targetYear && !includeTarget) continue;
    if (sameKvius(kviusSignature(year), targetSig)) {
      results.push({ hebrewYear: year, distance: Math.abs(year - targetYear) });
    }
  }
  results.sort((a, b) => a.distance - b.distance || a.hebrewYear - b.hebrewYear);
  return results;
}
