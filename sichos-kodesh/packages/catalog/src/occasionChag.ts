import { HDate, flags, getHolidaysOnDate } from '@hebcal/core';
import { mafteiachDay, mafteiachMonthToken } from './mafteiachMonth.js';
import { mafteiachMonthTokenToHDateMonth } from './hebrewDateKey.js';

/**
 * The real Yom Tovim (hebcal's `CHAG` flag - not every minor holiday:
 * Chanukah, Purim, Rosh Chodesh, and a fast day don't set it), grouped
 * coarsely enough for a search filter's dropdown - not one option per
 * hebcal `HolidayEvent.getDesc()` value, which is far more granular than
 * anyone searching for "Sukkos" would expect (`getDesc()` gives "Sukkot
 * I"/"Sukkot II" as separate events, "Rosh Hashana 5786" with the year
 * baked into the string, etc.). Israel's combined Shmini Atzeret/Simchat
 * Torah isn't a separate case here since this app is diaspora-only for
 * this pass (see config.ts's `IL`).
 */
export const CHAG_CATEGORIES = ['Rosh Hashana', 'Yom Kippur', 'Sukkot', 'Shmini Atzeret', 'Simchat Torah', 'Pesach', 'Shavuot'] as const;

export type ChagCategory = (typeof CHAG_CATEGORIES)[number];

/**
 * Which `CHAG_CATEGORIES` entry (if any) an occasion's own Hebrew date
 * falls on - resolves the real date via hebcal rather than guessing from
 * the occasion's label, the same approach `occasionParsha` uses. A
 * `getDesc()` value is matched by prefix against each category (e.g.
 * "Sukkot I", "Sukkot II", and Rosh Hashana's year-suffixed "Rosh Hashana
 * 5786" all match their category name's prefix) - safe since no category
 * name is itself a prefix of another.
 */
export function occasionChagCategory(hebrewDate: string, il: boolean): ChagCategory | null {
  const hebrewYear = Number(hebrewDate.split('-')[0]);
  const month = mafteiachMonthTokenToHDateMonth(mafteiachMonthToken(hebrewDate));
  const day = mafteiachDay(hebrewDate);
  const hdate = new HDate(day, month, hebrewYear);
  const events = getHolidaysOnDate(hdate, il);
  if (!events) return null;
  for (const ev of events) {
    if ((ev.getFlags() & flags.CHAG) === 0) continue;
    const desc = ev.getDesc();
    const category = CHAG_CATEGORIES.find((c) => desc.startsWith(c));
    if (category) return category;
  }
  return null;
}
