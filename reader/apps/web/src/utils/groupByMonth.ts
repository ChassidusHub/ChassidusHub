import { mafteiachMonthName, mafteiachMonthNameHebrew, mafteiachMonthToken } from '@chassidushub-reader/catalog';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import type { Language } from '../i18n/translations';

export interface MonthGroup {
  /** Raw mafteiach-index month token (e.g. "01", "06A") - URL-safe as-is, used to route a specific month (see MonthBrowserScreen/MonthOccasionsScreen). */
  monthToken: string;
  /** Display name in the current language, e.g. "Shevat" / "שבט". */
  monthName: string;
  entries: CatalogEntry[];
}

/** Entries are already sorted chronologically (see buildCatalog) - grouping consecutive same-token runs is enough. Grouped by the raw token, not the display name, so a leap year's split Adar I/II (same display root, different token) never accidentally merges. Shared by every screen that lists a whole year's occasions month-by-month. */
export function groupByMonth(entries: CatalogEntry[], language: Language): MonthGroup[] {
  const monthNameFor = language === 'he' ? mafteiachMonthNameHebrew : mafteiachMonthName;
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const monthToken = mafteiachMonthToken(entry.hebrewDate);
    const last = groups[groups.length - 1];
    if (last && last.monthToken === monthToken) last.entries.push(entry);
    else groups.push({ monthToken, monthName: monthNameFor(entry.hebrewDate), entries: [entry] });
  }
  return groups;
}
