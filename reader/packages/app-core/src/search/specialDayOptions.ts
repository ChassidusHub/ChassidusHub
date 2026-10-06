import { gematriya } from '@hebcal/core';
import { MAFTEIACH_MONTH_OPTIONS, SPECIAL_DAYS } from '@chassidushub-reader/catalog';
import type { Language } from './language.js';

export interface SpecialDayOption {
  /** `${hdateMonth}-${day}` - exactly what occasionSpecialDay returns, so a filter's stored value needs no translation back and forth. */
  value: string;
  label: string;
}

const MONTH_BY_HDATE_MONTH = new Map(MAFTEIACH_MONTH_OPTIONS.map((m) => [m.hdateMonth, m]));

/**
 * Auto-generated from each special day's own (month, day) - "י' שבט"/"10
 * Shevat" - rather than a hand-curated proper name per entry (e.g. "Yud
 * Shevat"). Deliberate: about a third of SPECIAL_DAYS have no such
 * household name at all (a recurring date the Rebbe held a sicha on, but
 * not one with its own common name), and this way every entry gets a
 * display label the exact same way, mechanically derived from data
 * already in the catalog package rather than 30-plus individually
 * hand-authored names that would be one more place to get a name
 * theologically or historically wrong.
 */
export function specialDayOptions(language: Language): SpecialDayOption[] {
  return SPECIAL_DAYS.map(({ hdateMonth, day }) => {
    const month = MONTH_BY_HDATE_MONTH.get(hdateMonth);
    const label = language === 'he' ? `${gematriya(day)} ${month?.nameHebrew ?? hdateMonth}` : `${day} ${month?.name ?? hdateMonth}`;
    return { value: `${hdateMonth}-${day}`, label };
  });
}
