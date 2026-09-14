import { Link } from 'react-router-dom';
import { mafteiachMonthName } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';

interface Props {
  hebrewYear: number;
}

interface MonthGroup {
  month: string;
  entries: CatalogEntry[];
}

/** Entries are already sorted chronologically (see buildCatalog) - grouping consecutive same-month runs is enough. */
function groupByMonth(entries: CatalogEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const month = mafteiachMonthName(entry.hebrewDate);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.entries.push(entry);
    else groups.push({ month, entries: [entry] });
  }
  return groups;
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
  // Only occasions with something real to download - an empty entry (mafteiach
  // indexed the occasion but nothing was resolved for it) is not worth a dead-end row.
  const entries: CatalogEntry[] = (catalog[hebrewYear] ?? []).filter((e) => e.audio.length > 0 || e.pdfs.length > 0);
  const monthGroups = groupByMonth(entries);

  return (
    <div className="screen">
      <BackLink to="/">change year</BackLink>
      <h1>Hebrew year {hebrewYear}</h1>
      <p className="subtitle">
        {entries.length} occasion{entries.length === 1 ? '' : 's'} indexed
      </p>
      {monthGroups.map((group) => (
        <div key={group.month}>
          <p className="category-header">{group.month}</p>
          <ul className="year-list">
            {group.entries.map((entry) => (
              <li key={entry.occasionId}>
                <Link className="year-row" to={`/browse/${hebrewYear}/${entry.occasionId}`}>
                  <span className="year-row-year">{entry.occasionLabel}</span>
                  <span className="year-row-distance">
                    {entry.audio.length > 0 ? 'audio' : ''}
                    {entry.audio.length > 0 && entry.pdfs.length > 0 ? ' + ' : ''}
                    {entry.pdfs.length > 0 ? `${entry.pdfs.length} pdf${entry.pdfs.length === 1 ? '' : 's'}` : ''}
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
