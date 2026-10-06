import { resolveThisWeek } from '@chassidushub-reader/catalog';
import type { CatalogByYear } from '@chassidushub-reader/catalog';
import { SPECIAL_ANNIVERSARY_YEARS, findMatchingYears } from '@chassidushub-reader/kvius-engine';
import type { MatchingYearResult } from '@chassidushub-reader/kvius-engine';

/** The years this week is followed in (web: utils/weekYears.ts): the kvius years (KviusYearsScreen) and the round anniversaries (there and on This week). */

/** Drops a candidate year with nothing indexed for the current week, then sorts chronologically (oldest first) - `findMatchingYears`/`findPartialWeekMatches` return nearest-first, which is right for finding the best match but wrong for reading a list top to bottom. */
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

/** Years hitting a round-number anniversary this calendar year - independent of kvius matching, so a separate section. Same "must have something for this week, oldest first" filtering as the other two. */
export function findSpecialAnniversaries(targetYear: number, catalog: CatalogByYear, today: Date): SpecialAnniversaryMatch[] {
  return SPECIAL_ANNIVERSARY_YEARS.map((anniversaryNumber) => ({ hebrewYear: targetYear - anniversaryNumber, anniversaryNumber }))
    .filter((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)
    .sort((a, b) => a.hebrewYear - b.hebrewYear);
}

/** The nearest kvius year with something indexed this week - the one This week shows the week of. */
export function bestKviusYear(targetYear: number, catalog: CatalogByYear, today: Date): number | null {
  return findMatchingYears(targetYear).find((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)?.hebrewYear ?? null;
}
