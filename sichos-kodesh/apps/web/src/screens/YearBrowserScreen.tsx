import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { groupByMonth } from '../utils/groupByMonth';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  hebrewYear: number;
}

/**
 * Browse mode's list-only screen: every entry the catalog has for one
 * Hebrew year, not just the single occasion "this week" auto-resolves to.
 * Doesn't use the kvius engine at all - a browsed year has no guaranteed
 * week/date alignment with the current Hebrew year, so there's no "this
 * week" to compute here, only "what does this year actually have."
 * Tapping a row navigates to /browse/:hebrewYear/:occasionId.
 */
export function YearBrowserScreen({ hebrewYear }: Props) {
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  // Only occasions with something real to download - an empty entry (mafteiach
  // indexed the occasion but nothing was resolved for it) is not worth a dead-end row.
  const entries: CatalogEntry[] = (catalog[hebrewYear] ?? []).filter((e) => e.audio.length > 0 || e.pdfs.length > 0);
  const monthGroups = groupByMonth(entries, language);

  return (
    <div className="screen">
      <BackLink to="/">{t.changeYear}</BackLink>
      <h1>{t.hebrewYearTitle(hebrewYear)}</h1>
      <p className="subtitle">{t.occasionsIndexed(entries.length)}</p>
      {monthGroups.map((group) => (
        <div key={group.month}>
          <p className="category-header">{group.month}</p>
          <ul className="year-list">
            {group.entries.map((entry) => (
              <li key={entry.occasionId}>
                <Link className="year-row" to={`/browse/${hebrewYear}/${entry.occasionId}`}>
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
