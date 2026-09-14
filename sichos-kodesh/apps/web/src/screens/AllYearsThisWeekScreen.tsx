import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { resolveThisWeekAllYears } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

/**
 * Reached from a farbrengen's own page ("All farbrengens this week, every
 * year") - every occasion indexed on one of this Hebrew week's dates,
 * across *every* year in the catalog, not just kvius-matched ones (see
 * `resolveThisWeekAllYears`). Picking one goes to its own farbrengen page
 * (`useThisWeekAllYearsEntry`), rendered with the same highlighted-hanacha
 * FarbrengenScreen as everywhere else in the follow flow.
 */
export function AllYearsThisWeekScreen() {
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const yearGroups = useMemo(() => resolveThisWeekAllYears(catalog), []);

  return (
    <div className="screen">
      <BackLink to="/">{t.home}</BackLink>
      <h1>{t.allFarbrengensThisWeekTitle}</h1>
      <p className="tab-help">{t.allFarbrengensThisWeekHelp}</p>

      {yearGroups.length === 0 && <p className="gap-message">{t.noFarbrengensAnyYear}</p>}

      {yearGroups.map(({ hebrewYear, entries }) => (
        <div key={hebrewYear}>
          <p className="category-header">{hebrewYearLabel(hebrewYear, language)}</p>
          <ul className="year-list">
            {entries.map((entry) => (
              <li key={entry.occasionId}>
                <Link className="year-row" to={`/this-week-all-years/${hebrewYear}/${entry.occasionId}`}>
                  <span className="year-row-main">
                    <OccasionRowIcon entry={entry} progressMap={progressMap} />
                    <span className="year-row-year">{entry.occasionLabel}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
