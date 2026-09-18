import { useContext } from 'react';
import { LanguageContext } from './languageContext';
import { STRINGS } from './translations';
import type { Language } from './translations';

export function isRtlLanguage(language: Language): boolean {
  return language === 'he';
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

export function useTranslation(): { t: (typeof STRINGS)['en']; language: Language; isRtl: boolean } {
  const { language, isRtl } = useLanguage();
  return { t: STRINGS[language], language, isRtl };
}
