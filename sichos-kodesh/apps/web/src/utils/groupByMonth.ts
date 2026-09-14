import { mafteiachMonthName, mafteiachMonthNameHebrew } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { Language } from '../i18n/translations';

export interface MonthGroup {
  month: string;
  entries: CatalogEntry[];
}

/** Entries are already sorted chronologically (see buildCatalog) - grouping consecutive same-month runs is enough. Shared by YearBrowserScreen and ThisWeekScreen's "All of {year}" section - both list a whole year's occasions the same way. */
export function groupByMonth(entries: CatalogEntry[], language: Language): MonthGroup[] {
  const monthName = language === 'he' ? mafteiachMonthNameHebrew : mafteiachMonthName;
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const month = monthName(entry.hebrewDate);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.entries.push(entry);
    else groups.push({ month, entries: [entry] });
  }
  return groups;
}
