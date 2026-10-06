import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LanguageContext } from './languageContext';
import type { Language } from './translations';

const STORAGE_KEY = 'sichos-kodesh:language';

function readStored(): Language {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'he' ? 'he' : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Mounted once at the app root (see App.tsx) so every screen - not just
 * whichever one happens to read `localStorage` fresh on its next mount -
 * re-renders immediately when the language changes, including
 * `GlobalPlayerBar`, which never unmounts across navigation. Also flips
 * `<html dir>`/`lang` so Hebrew actually lays out right-to-left instead of
 * just displaying Hebrew characters left-to-right.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStored);

  useEffect(() => {
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  function setLanguage(next: Language): void {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort persistence only.
    }
  }

  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}
