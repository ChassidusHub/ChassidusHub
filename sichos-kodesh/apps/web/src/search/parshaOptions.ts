import { Locale, parshiot } from '@hebcal/core';
import { CHAG_CATEGORIES } from '@sichos-kodesh/catalog';
import type { Language } from '../i18n/translations';

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

/** hebcal's own locale data has no entry for these two (they're this app's own category names, not one of hebcal's `HolidayEvent.getDesc()` strings - see occasionChag.ts) - `Locale.gettext` just echoes an unknown key back unchanged, so they need their own Hebrew text here instead. */
const CHOL_HAMOED_HEBREW: Partial<Record<string, string>> = {
  'Chol HaMoed Sukkot': 'חול המועד סוכות',
  'Chol HaMoed Pesach': 'חול המועד פסח',
};

/** The chag categories (see occasionChag.ts), already declared there in calendar order (Rosh Hashana through Shavuot) - grouped into the same dropdown as the parshiot (see SearchScreen), since "which occasion" is the same kind of question whether it's a weekly reading or a Yom Tov. */
export function chagOptions(language: Language): ParshaOption[] {
  return CHAG_CATEGORIES.map((name) => ({ value: name, label: language === 'he' ? (CHOL_HAMOED_HEBREW[name] ?? Locale.gettext(name, 'he-x-NoNikud')) : name }));
}
