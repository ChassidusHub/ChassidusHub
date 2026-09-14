import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Music } from 'lucide-react';
import { resolveThisWeekAllYears } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
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
                    {entry.audio.length > 0 && <Music size={14} className="year-row-audio-icon" aria-label={t.hasRecordingLabel} />}
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
