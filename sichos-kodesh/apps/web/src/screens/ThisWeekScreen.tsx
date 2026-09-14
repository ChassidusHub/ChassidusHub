import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Music } from 'lucide-react';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { groupByMonth } from '../utils/groupByMonth';
import { hebrewDayMonthLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  sourceYear: number;
}

/**
 * The list-only screen for "Follow along" - tapping a row navigates to
 * /follow/:sourceYear/:occasionId (see routes/useResolvedEntry.ts's
 * useFollowEntry). Below the current week, a collapsed "All of {year}"
 * section lists the *whole* kvius-matched year, month by month, the same
 * way YearBrowserScreen does for a plain browsed year - since the year is
 * kvius-matched, it's worth being able to look at any of its other weeks
 * too, not just today's. useFollowEntry resolves both kinds of link the
 * same way (falling back to a plain lookup outside "this week"), so an
 * "All of {year}" row still gets FarbrengenScreen's highlighted-hanacha
 * treatment, not a generic one.
 */
export function ThisWeekScreen({ sourceYear }: Props) {
  const { t, language } = useTranslation();
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog), [sourceYear]);
  const yearEntries: CatalogEntry[] = useMemo(
    () => (catalog[sourceYear] ?? []).filter((e) => e.audio.length > 0 || e.pdfs.length > 0),
    [sourceYear],
  );
  const monthGroups = useMemo(() => groupByMonth(yearEntries, language), [yearEntries, language]);

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
                {occasion.entry.audio.length > 0 && <Music size={14} className="year-row-audio-icon" aria-label={t.hasRecordingLabel} />}
                <span className="year-row-year">{occasion.entry.occasionLabel}</span>
              </span>
              <span className="year-row-distance">{hebrewDayMonthLabel(occasion.hebrewDate, language)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {monthGroups.length > 0 && (
        <details className="more-section">
          <summary className="more-section-summary">{t.allOfYear(sourceYear)}</summary>
          {monthGroups.map((group) => (
            <div key={group.month}>
              <p className="category-header">{group.month}</p>
              <ul className="year-list">
                {group.entries.map((entry) => (
                  <li key={entry.occasionId}>
                    <Link className="year-row" to={`/follow/${sourceYear}/${entry.occasionId}`}>
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
        </details>
      )}
    </div>
  );
}
