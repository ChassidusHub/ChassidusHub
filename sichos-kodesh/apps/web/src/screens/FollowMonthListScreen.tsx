import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { useCatalog } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { groupByMonth } from '../utils/groupByMonth';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  sourceYear: number;
}

/** Follow-flow twin of YearBrowserScreen: same month-first browsing, but links to /follow/:sourceYear/:occasionId instead of /browse/:hebrewYear/:occasionId. */
export function FollowMonthListScreen({ sourceYear }: Props) {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const entries: CatalogEntry[] = (catalog[sourceYear] ?? []).filter((e) => e.audio.length > 0 || e.pdfs.length > 0);
  const monthGroups = groupByMonth(entries, language);

  return (
    <div className="screen">
      <ScreenHeader to={`/follow/${sourceYear}`} title={t.allOfYear(sourceYear)} />
      <p className="subtitle">{t.occasionsIndexed(entries.length)}</p>
      <ul className="year-list">
        {monthGroups.map((group) => (
          <li key={group.monthToken}>
            <Link className="year-row" to={`/follow/${sourceYear}/month/${group.monthToken}`}>
              <span className="year-row-year">{group.monthName}</span>
              <span className="year-row-distance">{t.occasionsIndexed(group.entries.length)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
