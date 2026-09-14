import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewDayMonthLabel } from '../utils/formatHebrewDate';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  sourceYear: number;
}

/**
 * The list-only screen for "Follow along" - tapping a row navigates to
 * /follow/:sourceYear/:occasionId (see routes/useResolvedEntry.ts's
 * useFollowEntry). Below the current week, "All of {year}" links to
 * FollowMonthListScreen (/follow/:sourceYear/month) - the *whole*
 * kvius-matched year's months, not one long flat list, the same
 * month-first browsing FollowMonthListScreen/MonthOccasionsScreen give a
 * plain browsed year - since the year is kvius-matched, it's worth being
 * able to look at any of its other weeks too, not just today's.
 * useFollowEntry resolves both kinds of link the same way (falling back to
 * a plain lookup outside "this week"), so an occasion reached this way
 * still gets FarbrengenScreen's highlighted-hanacha treatment, not a
 * generic one.
 */
export function ThisWeekScreen({ sourceYear }: Props) {
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog), [sourceYear]);

  return (
    <div className="screen">
      <BackLink to="/kvius">{t.changeYear}</BackLink>
      <h1>{t.thisWeek}</h1>
      <p className="subtitle">{t.fromHebrewYear(sourceYear)}</p>

      {occasions.length === 0 && <p className="gap-message">{t.nothingThisWeek(sourceYear)}</p>}

      <ul className="year-list">
        {occasions.map((occasion) => (
          <li key={occasion.entry.occasionId}>
            <Link className="year-row" to={`/follow/${sourceYear}/${occasion.entry.occasionId}`}>
              <span className="year-row-main">
                <OccasionRowIcon entry={occasion.entry} progressMap={progressMap} />
                <span className="year-row-year">{occasion.entry.occasionLabel}</span>
              </span>
              <span className="year-row-distance">{hebrewDayMonthLabel(occasion.hebrewDate, language)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Link className="category-row" to={`/follow/${sourceYear}/month`}>
        <span className="category-row-name">{t.allOfYear(sourceYear)}</span>
      </Link>
    </div>
  );
}
