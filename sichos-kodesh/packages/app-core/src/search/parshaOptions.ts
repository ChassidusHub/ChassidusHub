import { Locale, parshiot } from '@hebcal/core';
import { CHAG_CATEGORIES } from '@sichos-kodesh/catalog';
import { CHOL_HAMOED_HEBREW } from './cholHamoedHebrew.js';
import type { Language } from './language.js';

export interface ParshaOption {
  /** The exact transliterated name `@hebcal/core`'s `Sedra`/`occasionParsha` use - what a filter actually compares against. */
  value: string;
  /** Display label in the current language. */
  label: string;
}

/** All 54 parshiot, in Torah-reading order - display-language labels only (see occasionParsha.ts for why matching against a doubled reading's *either* half still works). */
export function parshaOptions(language: Language): ParshaOption[] {
  return parshiot.map((name) => ({ value: name, label: language === 'he' ? Locale.gettext(name, 'he-x-NoNikud') : name }));
}

/** The chag categories (see occasionChag.ts), already declared there in calendar order (Rosh Hashana through Shavuot) - grouped into the same dropdown as the parshiot (see SearchScreen), since "which occasion" is the same kind of question whether it's a weekly reading or a Yom Tov. */
export function chagOptions(language: Language): ParshaOption[] {
  return CHAG_CATEGORIES.map((name) => ({ value: name, label: language === 'he' ? (CHOL_HAMOED_HEBREW[name] ?? Locale.gettext(name, 'he-x-NoNikud')) : name }));
}
