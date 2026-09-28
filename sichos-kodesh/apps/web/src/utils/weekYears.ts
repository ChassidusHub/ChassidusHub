import { resolveThisWeek } from '@sichos-kodesh/catalog';
import type { CatalogByYear } from '@sichos-kodesh/catalog';
import { SPECIAL_ANNIVERSARY_YEARS, findMatchingYears } from '@sichos-kodesh/kvius-engine';
import type { MatchingYearResult } from '@sichos-kodesh/kvius-engine';

/** The years this week is followed in: the kvius years (KviusYearsScreen) and the round anniversaries (there and on the home page). */

/**
 * Drops a candidate year with nothing indexed for the current week - not
 * worth offering if there's nothing to follow there (MIN_HISTORICAL_YEAR
 * isn't special-cased; it's just usually the one this excludes). Then
 * sorts chronologically (oldest first): `findMatchingYears`/
 * `findPartialWeekMatches` return nearest-first, which is right for
 * finding the best match but wrong for reading a list top to bottom.
 */
export function filterAndSortForDisplay(results: MatchingYearResult[], catalog: CatalogByYear, today: Date): MatchingYearResult[] {
  return results
    .filter((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)
    .slice()
    .sort((a, b) => a.hebrewYear - b.hebrewYear);
}

export interface SpecialAnniversaryMatch {
  hebrewYear: number;
  anniversaryNumber: number;
}

/**
 * Years hitting a round-number anniversary (see kvius-engine's
 * `SPECIAL_ANNIVERSARY_YEARS`) this calendar year - independent of kvius
 * matching (this is "N years since," not a calendar match), so it's a
 * separate section rather than folded into either list above. Same "must
 * have something for this week, oldest first" filtering as the other two.
 */
export function findSpecialAnniversaries(targetYear: number, catalog: CatalogByYear, today: Date): SpecialAnniversaryMatch[] {
  return SPECIAL_ANNIVERSARY_YEARS.map((anniversaryNumber) => ({ hebrewYear: targetYear - anniversaryNumber, anniversaryNumber }))
    .filter((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)
    .sort((a, b) => a.hebrewYear - b.hebrewYear);
}

/** The nearest kvius year with something indexed this week - the one the home page shows the week of. */
export function bestKviusYear(targetYear: number, catalog: CatalogByYear, today: Date): number | null {
  return findMatchingYears(targetYear).find((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)?.hebrewYear ?? null;
}
