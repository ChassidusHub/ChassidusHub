import React, { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { I18nManager } from 'react-native';
import { isRtlLanguage } from './useTranslation';
import { LanguageContext } from './languageContext';
import { readStoredLanguage, writeStoredLanguage } from './languageStorage';
import type { Language } from './translations';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    // Hebrew layout is handled by hand per `isRtl` (see ui/rtl.ts) so a
    // language switch applies immediately - React Native's own RTL
    // mirroring would double-flip it, and only ever changes on relaunch.
    I18nManager.allowRTL(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    readStoredLanguage().then((stored) => {
      if (!cancelled) setLanguageState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isRtl = isRtlLanguage(language);

  const value = useMemo(
    () => ({
      language,
      isRtl,
      setLanguage(next: Language) {
        setLanguageState(next);
        writeStoredLanguage(next);
      },
    }),
    [isRtl, language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
