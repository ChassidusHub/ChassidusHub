import { kviusSignature, sameKvius } from './hebrewCalendar.js';
import type { MatchingYearResult, MatchingYearsOptions } from './types.js';

/**
 * Hebrew year bounds of the real Sichos Kodesh catalog this app is built
 * from: `packages/mafteiach-index`'s crawled dataset (3,424 occasions),
 * verified directly against the database rather than assumed. MAX is the
 * dataset's actual last year. MIN is 5710, not the dataset's earliest year
 * (5690) - coverage before 5710 is sparse (1-14 occasions/year vs. 36+
 * starting exactly at 5710, verified against the database), predating the
 * Rebbe's own Sichos Kodesh that this app is about. A kvius match outside
 * this range can never resolve to a real recording, so `findMatchingYears`
 * clamps to it by default - otherwise the year picker would routinely
 * offer years guaranteed to be a gap.
 */
export const MIN_HISTORICAL_YEAR = 5710;
export const MAX_HISTORICAL_YEAR = 5752;

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
  const {
    fromYear = MIN_HISTORICAL_YEAR,
    toYear = MAX_HISTORICAL_YEAR,
    includeTarget = false,
    allowOutOfHistoricalRange = false,
  } = options;
  if (fromYear > toYear) {
    throw new RangeError(`fromYear (${fromYear}) must be <= toYear (${toYear})`);
  }
  const effectiveFromYear = allowOutOfHistoricalRange ? fromYear : Math.max(fromYear, MIN_HISTORICAL_YEAR);
  const effectiveToYear = allowOutOfHistoricalRange ? toYear : Math.min(toYear, MAX_HISTORICAL_YEAR);
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
