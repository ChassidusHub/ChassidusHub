import { kviusSignature, sameKvius } from './hebrewCalendar.js';
import type { MatchingYearResult, MatchingYearsOptions } from './types.js';

/**
 * Scans [fromYear, toYear] for Hebrew years whose kviah matches
 * `targetYear`'s, sorted nearest-first. This is the "which historical
 * years can I follow along with" list a user picks a source year from.
 */
export function findMatchingYears(targetYear: number, options: MatchingYearsOptions): MatchingYearResult[] {
  const { fromYear, toYear, includeTarget = false } = options;
  if (fromYear > toYear) {
    throw new RangeError(`fromYear (${fromYear}) must be <= toYear (${toYear})`);
  }
  const targetSig = kviusSignature(targetYear);
  const results: MatchingYearResult[] = [];
  for (let year = fromYear; year <= toYear; year++) {
    if (year === targetYear && !includeTarget) continue;
    if (sameKvius(kviusSignature(year), targetSig)) {
      results.push({ hebrewYear: year, distance: Math.abs(year - targetYear) });
    }
  }
  results.sort((a, b) => a.distance - b.distance || a.hebrewYear - b.hebrewYear);
  return results;
}
