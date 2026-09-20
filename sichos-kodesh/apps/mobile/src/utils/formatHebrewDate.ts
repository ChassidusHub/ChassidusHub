import { gematriya, Locale } from '@hebcal/core';
import { mafteiachDay, mafteiachMonthName, mafteiachMonthNameHebrew } from '@sichos-kodesh/catalog';
import type { Language } from '../i18n/translations';

export function hebrewDayMonthLabel(hebrewDate: string, language: Language): string {
  const day = mafteiachDay(hebrewDate);
  if (language === 'he') return `${gematriya(day)} ${mafteiachMonthNameHebrew(hebrewDate)}`;
  return `${day} ${mafteiachMonthName(hebrewDate)}`;
}

export function hebrewYearLabel(year: number, language: Language): string {
  return language === 'he' ? gematriya(year) : String(year);
}

export function hebrewFullDateLabel(hebrewDate: string, hebrewYear: number, language: Language): string {
  return `${hebrewDayMonthLabel(hebrewDate, language)} ${hebrewYearLabel(hebrewYear, language)}`;
}

export function parshaLabel(parsha: string[], language: Language): string {
  if (language === 'he') return parsha.map((name) => Locale.gettext(name, 'he-x-NoNikud')).join('-');
  return parsha.join('-');
}
