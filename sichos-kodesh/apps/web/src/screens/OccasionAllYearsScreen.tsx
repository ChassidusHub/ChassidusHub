import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { resolveOccasionAllYears } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  sourceHebrewYear: number;
  sourceOccasionId: number;
}

/**
 * Reached from a farbrengen's own page ("This occasion, every year") -
 * every occasion indexed on the *same Hebrew (month, day) as this specific
 * occasion*, across every year in the catalog (see
 * `resolveOccasionAllYears`). Deliberately not "this real week" the way
 * AllYearsThisWeekScreen is: the occasion actually on screen is almost
 * never this week (it's usually reached via a kvius-matched year's "All of
 * {year}" list, or a past this-week-all-years pick), so a "this week"
 * link there was showing an unrelated real-world week instead of anything
 * to do with the occasion the user was actually looking at - a real,
 * reported bug. Picking a result goes to its own farbrengen page
 * (`useOccasionAllYearsEntry`), rendered with the same highlighted-hanacha
 * FarbrengenScreen as everywhere else in the follow flow, with its own
 * back-link returning here (not to the unrelated this-week-all-years
 * list).
 */
export function OccasionAllYearsScreen({ sourceHebrewYear, sourceOccasionId }: Props) {
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const sourceEntry: CatalogEntry | undefined = (catalog[sourceHebrewYear] ?? []).find((e) => e.occasionId === sourceOccasionId);
  const yearGroups = useMemo(
    () => (sourceEntry ? resolveOccasionAllYears(catalog, sourceEntry.hebrewDate) : []),
    [sourceEntry],
  );

  if (!sourceEntry) {
    return (
      <div className="screen">
        <BackLink to="/">{t.home}</BackLink>
        <p className="gap-message">{t.occasionNotFound}</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <BackLink to={`/browse/${sourceHebrewYear}/${sourceOccasionId}`}>{t.back}</BackLink>
      <h1>{t.thisOccasionAllYearsTitle}</h1>
      <p className="tab-help">{t.thisOccasionAllYearsHelp}</p>

      {yearGroups.length === 0 && <p className="gap-message">{t.noFarbrengensAnyYear}</p>}

      {yearGroups.map(({ hebrewYear, entries }) => (
        <div key={hebrewYear}>
          <p className="category-header">{hebrewYearLabel(hebrewYear, language)}</p>
          <ul className="year-list">
            {entries.map((entry) => (
              <li key={entry.occasionId}>
                <Link className="year-row" to={`/occasion-all-years/${sourceHebrewYear}/${sourceOccasionId}/${hebrewYear}/${entry.occasionId}`}>
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
