import { Link } from 'react-router-dom';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { BackLink } from '../components/BackLink';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  targetYear: number;
}

/**
 * Reached from the home screen's hero button - every kvius-matched year
 * (see kvius-engine's `findMatchingYears`, "sorted nearest-first"),
 * nearest first. Picking one goes into that year's current week
 * (ThisWeekScreen), which itself now also links to that whole year's full
 * content, not just this week's slice.
 */
export function KviusYearsScreen({ targetYear }: Props) {
  const { t, language } = useTranslation();
  const matches = findMatchingYears(targetYear);

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
    </div>
  );
}
