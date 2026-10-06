import { gematriya, Locale } from '@hebcal/core';
import { mafteiachDay, mafteiachMonthName, mafteiachMonthNameHebrew } from '@sichos-kodesh/catalog';
import type { Language } from '../search/language.js';

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
  // A library item can carry only a month ("5736-05") or no date at all: it shows what it has.
  if (!/^\d{4}-\d{2}[AB]?/.test(hebrewDate)) return '';
  const month = language === 'he' ? mafteiachMonthNameHebrew(hebrewDate) : mafteiachMonthName(hebrewDate);
  const day = mafteiachDay(hebrewDate);
  if (!(day > 0)) return month;
  return `${language === 'he' ? gematriya(day) : day} ${month}`;
}

/** A Hebrew calendar year number, in gematriya for the Hebrew UI (e.g. 5736 -> "תשל״ו") and plain digits otherwise. */
export function hebrewYearLabel(year: number, language: Language): string {
  return language === 'he' ? gematriya(year) : String(year);
}

/**
 * An occasion's full Hebrew date - day, month, and year together (e.g.
 * "6 Adar I 5736" / "ו׳ אדר א׳ תשל״ו") - unlike `hebrewDayMonthLabel`
 * above, which deliberately drops the year on a page already scoped to
 * one source year. Used wherever an occasion is shown *out of* that
 * context instead - the media player, the home page's cross-year
 * "Continue" list - where the year isn't otherwise implied by the page
 * itself and leaving it out would make an occasion that recurs every
 * year (which is most of them) ambiguous about which year's occurrence
 * this actually is.
 */
export function hebrewFullDateLabel(hebrewDate: string, hebrewYear: number, language: Language): string {
  return [hebrewDayMonthLabel(hebrewDate, language), hebrewYear > 0 ? hebrewYearLabel(hebrewYear, language) : ''].filter(Boolean).join(' ');
}

/**
 * A parsha name (or a doubled reading's two names), in Hebrew for the
 * Hebrew UI - `currentParsha`'s own `parsha` field is always the plain
 * transliterated name (e.g. "Ha'azinu") regardless of UI language, since
 * that's what `@hebcal/core`'s `Sedra` returns. `Locale.gettext` is
 * `@hebcal/core`'s own bundled translation table for exactly this kind of
 * standard Hebrew-calendar term; the "NoNikud" variant is used (rather than
 * plain "he") to match `todayHebrewDateLabel`'s own choice to render
 * without vowel points, which reads more naturally as a label.
 */
export function parshaLabel(parsha: string[], language: Language): string {
  if (language === 'he') return parsha.map((name) => Locale.gettext(name, 'he-x-NoNikud')).join('-');
  return parsha.join('-');
}
