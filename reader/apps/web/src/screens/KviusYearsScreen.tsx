import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { thisWeekDays } from '@chassidushub-reader/catalog';
import { findMatchingYears, findPartialWeekMatches } from '@chassidushub-reader/kvius-engine';
import { filterAndSortForDisplay, findSpecialAnniversaries } from '../utils/weekYears';
import { IL } from '../config';
import { useCatalog } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  targetYear: number;
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
  const catalog = useCatalog();
  const today = useMemo(() => new Date(), []);
  const matches = useMemo(() => filterAndSortForDisplay(findMatchingYears(targetYear), catalog, today), [catalog, targetYear, today]);
  const partialMatches = useMemo(
    () => filterAndSortForDisplay(findPartialWeekMatches(targetYear, thisWeekDays(today), IL), catalog, today),
    [catalog, targetYear, today],
  );
  const specialAnniversaries = useMemo(() => findSpecialAnniversaries(targetYear, catalog, today), [catalog, targetYear, today]);

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
