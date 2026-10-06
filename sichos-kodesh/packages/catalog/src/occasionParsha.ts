import { HDate, getSedra } from '@hebcal/core';
import type { Sedra } from '@hebcal/core';
import { mafteiachDay, mafteiachMonthToken } from './mafteiachMonth.js';
import { mafteiachMonthTokenToHDateMonth } from './hebrewDateKey.js';

/**
 * One `Sedra` (a whole Hebrew year's parsha schedule) per (year, il) pair,
 * built once and reused - `occasionParsha` is meant to be called once per
 * occasion while scanning the *whole* catalog (see the search feature),
 * and many occasions share a year; rebuilding a year's schedule per
 * occasion would be needless repeated work.
 */
const sedraCache = new Map<string, Sedra>();

function sedraFor(hebrewYear: number, il: boolean): Sedra {
  const key = `${hebrewYear}:${il}`;
  let sedra = sedraCache.get(key);
  if (!sedra) {
    sedra = getSedra(hebrewYear, il);
    sedraCache.set(key, sedra);
  }
  return sedra;
}

/**
 * The parsha for the Shabbos an occasion's own Hebrew date falls on or
 * before - a weekday occasion rolls forward to its own week's Shabbos,
 * the same way `currentParsha` does for "today." Two entries (a doubled
 * reading), or `null` on a chag, when there's no weekly reading that week.
 * Occasions on or around a chag, or a doubled parsha, are why this has to
 * resolve each occasion's date through `Sedra` rather than guess from a
 * fixed (month, day) -> parsha table - which Shabbos falls where shifts
 * from year to year.
 */
export function occasionParsha(hebrewDate: string, il: boolean): string[] | null {
  const parts = hebrewDate.split('-');
  const hebrewYear = Number(parts[0]);
  const month = mafteiachMonthTokenToHDateMonth(mafteiachMonthToken(hebrewDate));
  const day = mafteiachDay(hebrewDate);
  const hdate = new HDate(day, month, hebrewYear);
  const result = sedraFor(hebrewYear, il).lookup(hdate);
  return result.chag ? null : result.parsha;
}
