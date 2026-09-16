import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { resolveOccasionAllYears } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewDayMonthLabel, hebrewYearLabel } from '../utils/formatHebrewDate';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  sourceHebrewYear: number;
  sourceOccasionId: number;
}

/**
 * Every occasion indexed on the same Hebrew (month, day) as this
 * specific occasion, across every catalog year (see
 * `resolveOccasionAllYears`). Deliberately not "this real week" the way
 * AllYearsThisWeekScreen is: the occasion on screen is rarely actually
 * this week (usually reached via a kvius-matched year's "All of {year}"
 * list, or a past this-week-all-years pick), so a "this week" link here
 * would point at an unrelated real-world week instead of anything to do
 * with the occasion being viewed.
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
        <BackLink to="/" />
        <p className="gap-message">{t.occasionNotFound}</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader to={`/browse/${sourceHebrewYear}/${sourceOccasionId}`} title={t.thisOccasionAllYearsTitle} />
      <p className="tab-help">{t.thisOccasionAllYearsHelp(hebrewDayMonthLabel(sourceEntry.hebrewDate, language))}</p>

      {yearGroups.length === 0 && <p className="gap-message">{t.noFarbrengensAnyYear}</p>}

      {yearGroups.map(({ hebrewYear, entries }) => (
        <div key={hebrewYear}>
          <p className="category-header">{hebrewYearLabel(hebrewYear, language)}</p>
          <ul className="year-list">
            {entries.map((entry) => (
              <li key={entry.occasionId}>
                <Link className="year-row" to={`/occasion-all-years/${sourceHebrewYear}/${sourceOccasionId}/${hebrewYear}/${entry.occasionId}`}>
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
