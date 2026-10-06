import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { useCatalog } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { groupByMonth } from '../utils/groupByMonth';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  hebrewYear: number;
}

/**
 * Browse mode's first screen for a year: only months with something to
 * show, each linking to that month's own occasion list
 * (MonthOccasionsScreen). Doesn't use the kvius engine - a browsed year
 * has no guaranteed week/date alignment with the current Hebrew year, so
 * there's no "this week" to compute here, only what the year has.
 */
export function YearBrowserScreen({ hebrewYear }: Props) {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  // Filters out entries mafteiach indexed but nothing was resolved for -
  // an empty entry isn't worth a dead-end row.
  const entries: CatalogEntry[] = (catalog[hebrewYear] ?? []).filter((e) => e.audio.length > 0 || e.pdfs.length > 0);
  const monthGroups = groupByMonth(entries, language);

  return (
    <div className="screen">
      <ScreenHeader to="/farbrengens" title={t.hebrewYearTitle(hebrewYear)} />
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
