import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { resolveThisWeek, thisWeekDays } from '@sichos-kodesh/catalog';
import { SPECIAL_ANNIVERSARY_YEARS, findMatchingYears, findPartialWeekMatches } from '@sichos-kodesh/kvius-engine';
import type { MatchingYearResult } from '@sichos-kodesh/kvius-engine';
import { IL } from '../config';
import catalog from '../catalog/data';
import { ScreenHeader } from '../components/ScreenHeader';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  targetYear: number;
}

/**
 * Drops a candidate year with nothing indexed for the current week - not
 * worth offering if there's nothing to follow there (MIN_HISTORICAL_YEAR
 * isn't special-cased; it's just usually the one this excludes). Then
 * sorts chronologically (oldest first): `findMatchingYears`/
 * `findPartialWeekMatches` return nearest-first, which is right for
 * finding the best match but wrong for reading a list top to bottom.
 */
function filterAndSortForDisplay(results: MatchingYearResult[], today: Date): MatchingYearResult[] {
  return results
    .filter((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)
    .slice()
    .sort((a, b) => a.hebrewYear - b.hebrewYear);
}

interface SpecialAnniversaryMatch {
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
function findSpecialAnniversaries(targetYear: number, today: Date): SpecialAnniversaryMatch[] {
  return SPECIAL_ANNIVERSARY_YEARS.map((anniversaryNumber) => ({ hebrewYear: targetYear - anniversaryNumber, anniversaryNumber }))
    .filter((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)
    .sort((a, b) => a.hebrewYear - b.hebrewYear);
}

/**
 * Every kvius-matched year (see kvius-engine's `findMatchingYears`) with
 * something indexed for the current week, oldest first. Below it, a
 * secondary section lists years that are not a full kvius match but
 * whose this-week dates still land on a matching week there too
 * (`findPartialWeekMatches`) - a weaker claim, kept visually separate
 * from the primary list. Both link into that year's current week
 * (ThisWeekScreen) via the same `/follow/:year` route: the catalog
 * lookup there just translates this week's (month, day) directly, which
 * a partial match has already confirmed works for that week.
 */
export function KviusYearsScreen({ targetYear }: Props) {
  const { t, language } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const matches = useMemo(() => filterAndSortForDisplay(findMatchingYears(targetYear), today), [targetYear, today]);
  const partialMatches = useMemo(
    () => filterAndSortForDisplay(findPartialWeekMatches(targetYear, thisWeekDays(today), IL), today),
    [targetYear, today],
  );
  const specialAnniversaries = useMemo(() => findSpecialAnniversaries(targetYear, today), [targetYear, today]);

  return (
    <div className="screen">
      <ScreenHeader to="/" title={t.weekKviusFarbrengens} />
      <p className="tab-help">{t.kviusHelp(targetYear)}</p>
      <ul className="year-list">
        {matches.map((item) => (
          <li key={item.hebrewYear}>
            <Link className="year-row" to={`/follow/${item.hebrewYear}`}>
              <span className="year-row-year">{hebrewYearLabel(item.hebrewYear, language)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {partialMatches.length > 0 && (
        <>
          <p className="category-header">{t.partialKviusMatchesHeader}</p>
          <p className="tab-help">{t.partialKviusMatchesHelp}</p>
          <ul className="year-list">
            {partialMatches.map((item) => (
              <li key={item.hebrewYear}>
                <Link className="year-row" to={`/follow/${item.hebrewYear}`}>
                  <span className="year-row-year">{hebrewYearLabel(item.hebrewYear, language)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {specialAnniversaries.length > 0 && (
        <>
          <p className="category-header">{t.specialAnniversariesHeader}</p>
          <p className="tab-help">{t.specialAnniversariesHelp}</p>
          <ul className="year-list">
            {specialAnniversaries.map((item) => (
              <li key={item.hebrewYear}>
                <Link className="year-row" to={`/follow/${item.hebrewYear}`}>
                  <span className="year-row-year">{hebrewYearLabel(item.hebrewYear, language)}</span>
                  <span className="year-row-distance">{t.specialAnniversaryLabel(item.anniversaryNumber)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
