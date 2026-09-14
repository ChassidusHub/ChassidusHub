import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { resolveThisWeek, thisWeekDays } from '@sichos-kodesh/catalog';
import { SPECIAL_ANNIVERSARY_YEARS, findMatchingYears, findPartialWeekMatches } from '@sichos-kodesh/kvius-engine';
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

interface SpecialAnniversaryMatch {
  hebrewYear: number;
  anniversaryNumber: number;
}

/**
 * Years hitting a round-number anniversary (see kvius-engine's
 * `SPECIAL_ANNIVERSARY_YEARS`) this real calendar year - entirely
 * independent of kvius matching (a full/partial match is about the
 * *calendar* lining up; this is just "N years since," and the two only
 * coincide by coincidence), so it's its own section rather than folded
 * into either list above. Same "must have something for this week, oldest
 * first" filtering as the other two.
 */
function findSpecialAnniversaries(targetYear: number, today: Date): SpecialAnniversaryMatch[] {
  return SPECIAL_ANNIVERSARY_YEARS.map((anniversaryNumber) => ({ hebrewYear: targetYear - anniversaryNumber, anniversaryNumber }))
    .filter((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)
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
  const specialAnniversaries = useMemo(() => findSpecialAnniversaries(targetYear, today), [targetYear, today]);

  return (
    <div className="screen">
      <BackLink to="/" />
      <h1>{t.weekKviusFarbrengens}</h1>
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
