import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { resolveOccasionAllYears } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { occasionTitle } from '@sichos-kodesh/app-core';
import { useCatalog } from '../catalog/catalogStore';
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
 * This specific occasion in every catalog year it happened, matched by
 * what it *is* rather than by its date alone (see `resolveOccasionAllYears`
 * in packages/catalog: several farbrengens share one date, and the same
 * one moves between the eve and the day from year to year), with
 * whatever else that year has on the same date listed beneath as "also
 * on this date". Deliberately not "this real week" the way
 * AllYearsThisWeekScreen is: the occasion on screen is rarely actually
 * this week (usually reached via a kvius-matched year's "All of {year}"
 * list, or a past this-week-all-years pick), so a "this week" link here
 * would point at an unrelated real-world week instead of anything to do
 * with the occasion being viewed.
 */
export function OccasionAllYearsScreen({ sourceHebrewYear, sourceOccasionId }: Props) {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const sourceEntry: CatalogEntry | undefined = (catalog[sourceHebrewYear] ?? []).find((e) => e.occasionId === sourceOccasionId);
  const yearGroups = useMemo(() => (sourceEntry ? resolveOccasionAllYears(catalog, sourceEntry) : []), [catalog, sourceEntry]);

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
      <p className="tab-help">{t.thisOccasionAllYearsHelp(occasionTitle(sourceEntry, language), hebrewDayMonthLabel(sourceEntry.hebrewDate, language))}</p>

      {yearGroups.length === 0 && <p className="gap-message">{t.noFarbrengensAnyYear}</p>}

      {yearGroups.map(({ hebrewYear, matches, others }) => (
        <div key={hebrewYear}>
          <p className="category-header">{hebrewYearLabel(hebrewYear, language)}</p>
          {matches.length > 0 && (
            <ul className="year-list">
              {matches.map((entry) => (
                <li key={entry.occasionId}>
                  <Link className="year-row" to={`/occasion-all-years/${sourceHebrewYear}/${sourceOccasionId}/${hebrewYear}/${entry.occasionId}`}>
                    <span className="year-row-year">{occasionTitle(entry, language)}</span>
                    <span className="year-row-trailing">
                      <OccasionRowIcon entry={entry} progressMap={progressMap} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {others.length > 0 && (
            <>
              <p className="tab-help occasion-others-label">{t.alsoOnThisDate}</p>
              <ul className="year-list occasion-others-list">
                {others.map((entry) => (
                  <li key={entry.occasionId}>
                    <Link className="year-row" to={`/occasion-all-years/${sourceHebrewYear}/${sourceOccasionId}/${hebrewYear}/${entry.occasionId}`}>
                      <span className="year-row-year">{occasionTitle(entry, language)}</span>
                      <span className="year-row-trailing">
                        <OccasionRowIcon entry={entry} progressMap={progressMap} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
