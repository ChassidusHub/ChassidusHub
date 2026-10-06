import { createContext } from 'react';
import type { Language } from './translations';

export interface LanguageContextValue {
  language: Language;
  isRtl: boolean;
  setLanguage: (language: Language) => void;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);
