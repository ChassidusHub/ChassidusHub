import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { resolveThisWeekAllYears } from '@sichos-kodesh/catalog';
import { useCatalog } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

/** Every occasion indexed on one of this Hebrew week's dates across every catalog year, not just kvius-matched ones (see `resolveThisWeekAllYears`). */
export function AllYearsThisWeekScreen() {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const yearGroups = useMemo(() => resolveThisWeekAllYears(catalog), [catalog]);

  return (
    <div className="screen">
      <ScreenHeader to="/" title={t.allFarbrengensThisWeekTitle} />
      <p className="tab-help">{t.allFarbrengensThisWeekHelp}</p>

      {yearGroups.length === 0 && <p className="gap-message">{t.noFarbrengensAnyYear}</p>}

      {yearGroups.map(({ hebrewYear, entries }) => (
        <div key={hebrewYear}>
          <p className="category-header">{hebrewYearLabel(hebrewYear, language)}</p>
          <ul className="year-list">
            {entries.map((entry) => (
              <li key={entry.occasionId}>
                <Link className="year-row" to={`/this-week-all-years/${hebrewYear}/${entry.occasionId}`}>
                  <span className="year-row-year">{entry.occasionLabel}</span>
                  <span className="year-row-trailing">
                    <OccasionRowIcon entry={entry} progressMap={progressMap} />
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
