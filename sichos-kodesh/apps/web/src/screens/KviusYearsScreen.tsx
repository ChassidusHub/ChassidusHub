import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { resolveThisWeek, thisWeekDays } from '@sichos-kodesh/catalog';
import { findMatchingYears, findPartialWeekMatches } from '@sichos-kodesh/kvius-engine';
import type { MatchingYearResult } from '@sichos-kodesh/kvius-engine';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  targetYear: number;
}

/** Drops a candidate year that has nothing indexed for the current week at all - a kvius (or partial-week) match is only useful to offer as a pick if there's actually something to follow there; MIN_HISTORICAL_YEAR (5710) isn't otherwise special-cased, it's just usually the one this ends up excluding. Then sorted chronologically (oldest first) for display - `findMatchingYears`/`findPartialWeekMatches` return nearest-first, the right order for *finding* the best match, but the wrong order for reading a years list top to bottom. */
function filterAndSortForDisplay(results: MatchingYearResult[], today: Date): MatchingYearResult[] {
  return results
    .filter((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)
    .slice()
    .sort((a, b) => a.hebrewYear - b.hebrewYear);
}

/**
 * Reached from the home screen's hero button - every kvius-matched year
 * (see kvius-engine's `findMatchingYears`) that actually has something
 * indexed for the current week, oldest first. Below it, a clearly-labeled
 * secondary section lists years that are NOT a full kvius match but whose
 * *this-week* dates still happen to translate onto a real, matching week
 * there too (`findPartialWeekMatches`) - a weaker claim than a full kvius
 * match, so it's kept visually and semantically separate rather than
 * merged into the primary list. Picking either goes into that year's
 * current week (ThisWeekScreen) via the same `/follow/:year` route: the
 * underlying day-by-day catalog lookup there just translates this week's
 * (month, day) values directly, which is exactly what a partial match
 * already confirms works for that specific week.
 */
export function KviusYearsScreen({ targetYear }: Props) {
  const { t, language } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const matches = useMemo(() => filterAndSortForDisplay(findMatchingYears(targetYear), today), [targetYear, today]);
  const partialMatches = useMemo(
    () => filterAndSortForDisplay(findPartialWeekMatches(targetYear, thisWeekDays(today)), today),
    [targetYear, today],
  );

  return (
    <div className="screen">
      <BackLink to="/">{t.home}</BackLink>
      <h1>{t.weekKviusFarbrengens}</h1>
      <p className="tab-help">{t.kviusHelp(targetYear)}</p>
      <ul className="year-list">
        {matches.map((item) => (
          <li key={item.hebrewYear}>
            <Link className="year-row" to={`/follow/${item.hebrewYear}`}>
              <span className="year-row-year">{hebrewYearLabel(item.hebrewYear, language)}</span>
              <span className="year-row-distance">{t.yearsAgo(item.distance)}</span>
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
                  <span className="year-row-distance">{t.yearsAgo(item.distance)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
