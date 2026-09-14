import { useContext } from 'react';
import { LanguageContext } from './languageContext';
import type { LanguageContextValue } from './languageContext';
import { STRINGS } from './translations';
import type { Language } from './translations';

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

/** `t` is the current language's whole strings object (see translations.ts) - call it like `t.recordings` or `t.recordingsCount(3)`. */
export function useTranslation(): { t: (typeof STRINGS)['en']; language: Language } {
  const { language } = useLanguage();
  return { t: STRINGS[language], language };
}
