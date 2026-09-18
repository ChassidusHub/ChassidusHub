import React, { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { LanguageContext } from './languageContext';
import { readStoredLanguage, writeStoredLanguage } from './languageStorage';
import type { Language } from './translations';

function isRtlLanguage(language: Language): boolean {
  return language === 'he';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    I18nManager.allowRTL(true);
    I18nManager.swapLeftAndRightInRTL(true);
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

  return (
    <LanguageContext.Provider value={value}>
      <View style={[styles.container, isRtl ? styles.rtl : styles.ltr]}>{children}</View>
    </LanguageContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  ltr: { direction: 'ltr' },
  rtl: { direction: 'rtl' },
});
