import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { groupByMonth } from '../utils/groupByMonth';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  hebrewYear: number;
}

/**
 * Browse mode's first screen for a year: only the months with something
 * real to show (not all 12/13 unconditionally), each linking to that
 * month's own occasion list (MonthOccasionsScreen) - not one long flat
 * list of the whole year at once, which was the reported problem
 * (scrolling through 60+ rows to find one occasion). Doesn't use the
 * kvius engine at all - a browsed year has no guaranteed week/date
 * alignment with the current Hebrew year, so there's no "this week" to
 * compute here, only "what does this year actually have."
 */
export function YearBrowserScreen({ hebrewYear }: Props) {
  const { t, language } = useTranslation();
  // Only occasions with something real to download - an empty entry (mafteiach
  // indexed the occasion but nothing was resolved for it) is not worth a dead-end row.
  const entries: CatalogEntry[] = (catalog[hebrewYear] ?? []).filter((e) => e.audio.length > 0 || e.pdfs.length > 0);
  const monthGroups = groupByMonth(entries, language);

  return (
    <div className="screen">
      <BackLink to="/" />
      <h1>{t.hebrewYearTitle(hebrewYear)}</h1>
      <p className="subtitle">{t.occasionsIndexed(entries.length)}</p>
      <ul className="year-list">
        {monthGroups.map((group) => (
          <li key={group.monthToken}>
            <Link className="year-row" to={`/browse/${hebrewYear}/month/${group.monthToken}`}>
              <span className="year-row-year">{group.monthName}</span>
              <span className="year-row-distance">{t.occasionsIndexed(group.entries.length)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
