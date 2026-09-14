import { Locale, parshiot } from '@hebcal/core';
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
