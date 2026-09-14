import { mafteiachMonthName } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';

export interface MonthGroup {
  month: string;
  entries: CatalogEntry[];
}

/** Entries are already sorted chronologically (see buildCatalog) - grouping consecutive same-month runs is enough. Shared by YearBrowserScreen and ThisWeekScreen's "All of {year}" section - both list a whole year's occasions the same way. */
export function groupByMonth(entries: CatalogEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const month = mafteiachMonthName(entry.hebrewDate);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.entries.push(entry);
    else groups.push({ month, entries: [entry] });
  }
  return groups;
}
