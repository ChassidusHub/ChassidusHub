import { gematriya } from '@hebcal/core';
import { mafteiachDay, mafteiachMonthName, mafteiachMonthNameHebrew } from '@sichos-kodesh/catalog';
import type { Language } from '../i18n/translations';

/**
 * A raw mafteiach-index date key's day+month, with no year - e.g.
 * "5736-06A-06" -> "6 Adar I" (en) / "ו׳ אדר א׳" (he, gematriya day
 * number). Used wherever an occasion's *own* Hebrew date should be shown
 * instead of the real current-week Gregorian date it happens to translate
 * onto in a kvius-matched source year - the two are unrelated once you're
 * not in the matched year itself, and showing the Gregorian one reads as
 * "this year's date," which it isn't.
 */
export function hebrewDayMonthLabel(hebrewDate: string, language: Language): string {
  const day = mafteiachDay(hebrewDate);
  if (language === 'he') return `${gematriya(day)} ${mafteiachMonthNameHebrew(hebrewDate)}`;
  return `${day} ${mafteiachMonthName(hebrewDate)}`;
}
