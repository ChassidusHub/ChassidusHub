import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Language } from './translations';

export const LANGUAGE_STORAGE_KEY = 'chassidushub:language';

function isLanguage(value: string | null): value is Language {
  return value === 'en' || value === 'he';
}

export async function readStoredLanguage(): Promise<Language> {
  try {
    const value = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(value) ? value : 'en';
  } catch {
    return 'en';
  }
}

export async function writeStoredLanguage(language: Language): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Best-effort persistence only.
  }
}
