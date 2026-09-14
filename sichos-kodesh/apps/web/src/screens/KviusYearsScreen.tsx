import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { thisWeekDays } from '@sichos-kodesh/catalog';
import { findMatchingYears, findPartialWeekMatches } from '@sichos-kodesh/kvius-engine';
import { BackLink } from '../components/BackLink';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  targetYear: number;
}

/**
 * Reached from the home screen's hero button - every kvius-matched year
 * (see kvius-engine's `findMatchingYears`, "sorted nearest-first"),
 * nearest first, shown as the primary list. Below it, a clearly-labeled
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
  const matches = findMatchingYears(targetYear);
  const partialMatches = useMemo(() => findPartialWeekMatches(targetYear, thisWeekDays(new Date())), [targetYear]);

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
