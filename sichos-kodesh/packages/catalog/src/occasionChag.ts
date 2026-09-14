import { HDate, flags, getHolidaysOnDate } from '@hebcal/core';
import { mafteiachDay, mafteiachMonthToken } from './mafteiachMonth.js';
import { mafteiachMonthTokenToHDateMonth } from './hebrewDateKey.js';

/**
 * Whether an occasion's own Hebrew date falls on a real Yom Tov (Rosh
 * Hashana, Yom Kippur, Sukkos, Shmini Atzeres/Simchas Torah, Pesach,
 * Shavuos - hebcal's `CHAG` flag), not every minor holiday: Chanukah,
 * Purim, Rosh Chodesh, and a fast day don't set it, matching what "chag"
 * ordinarily means in this context. Drives the search feature's chag
 * filter, the same "resolve the real date, don't guess from the label"
 * approach `occasionParsha` uses.
 */
export function isChagOccasion(hebrewDate: string, il: boolean): boolean {
  const hebrewYear = Number(hebrewDate.split('-')[0]);
  const month = mafteiachMonthTokenToHDateMonth(mafteiachMonthToken(hebrewDate));
  const day = mafteiachDay(hebrewDate);
  const hdate = new HDate(day, month, hebrewYear);
  const events = getHolidaysOnDate(hdate, il);
  return events?.some((ev) => (ev.getFlags() & flags.CHAG) !== 0) ?? false;
}
