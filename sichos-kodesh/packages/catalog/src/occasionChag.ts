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
 *
 * "Chol HaMoed Sukkot"/"Chol HaMoed Pesach" are their own categories, not
 * folded into "Sukkot"/"Pesach" - a real, reported gap, not an oversight:
 * hebcal's own `CHOL_HAMOED` flag is distinct from `CHAG` (an intermediate
 * day of either week-long Yom Tov isn't itself `CHAG`-flagged), so before
 * this they resolved to `null` here and were simply unsearchable by chag,
 * even though they're real, meaningful days in their own right (and,
 * unlike the first/last days, common days for the Rebbe to farbreng on).
 */
export const CHAG_CATEGORIES = [
  'Rosh Hashana',
  'Yom Kippur',
  'Sukkot',
  'Chol HaMoed Sukkot',
  'Shmini Atzeret',
  'Simchat Torah',
  'Pesach',
  'Chol HaMoed Pesach',
  'Shavuot',
] as const;

export type ChagCategory = (typeof CHAG_CATEGORIES)[number];

/**
 * Which `CHAG_CATEGORIES` entry (if any) an occasion's own Hebrew date
 * falls on - resolves the real date via hebcal rather than guessing from
 * the occasion's label, the same approach `occasionParsha` uses. A
 * `getDesc()` value is matched by prefix against each category (e.g.
 * "Sukkot I", "Sukkot II", and Rosh Hashana's year-suffixed "Rosh Hashana
 * 5786" all match their category name's prefix) - safe since no category
 * name is itself a prefix of another. Chol HaMoed days are checked first
 * and separately, by hebcal's own `CHOL_HAMOED` flag rather than `CHAG` -
 * their `getDesc()` ("Sukkot III (CH''M)", "Pesach III (CH''M)") still
 * starts with the plain Yom Tov's name, so without this they'd never be
 * reached at all: `CHOL_HAMOED` events aren't also `CHAG`-flagged, and the
 * loop below skips anything that isn't.
 */
export function occasionChagCategory(hebrewDate: string, il: boolean): ChagCategory | null {
  const hebrewYear = Number(hebrewDate.split('-')[0]);
  const month = mafteiachMonthTokenToHDateMonth(mafteiachMonthToken(hebrewDate));
  const day = mafteiachDay(hebrewDate);
  const hdate = new HDate(day, month, hebrewYear);
  const events = getHolidaysOnDate(hdate, il);
  if (!events) return null;
  for (const ev of events) {
    const desc = ev.getDesc();
    if (ev.getFlags() & flags.CHOL_HAMOED) {
      if (desc.startsWith('Sukkot')) return 'Chol HaMoed Sukkot';
      if (desc.startsWith('Pesach')) return 'Chol HaMoed Pesach';
      continue;
    }
    if ((ev.getFlags() & flags.CHAG) === 0) continue;
    const category = CHAG_CATEGORIES.find((c) => desc.startsWith(c));
    if (category) return category;
  }
  return null;
}
