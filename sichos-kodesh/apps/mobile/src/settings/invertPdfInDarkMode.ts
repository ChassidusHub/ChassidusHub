import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether a PDF's pages are shown with their colours flipped (white text
 * on black), remembered separately for dark mode and for light mode: on
 * by default at night, off by default by day. Settings' "Invert PDF
 * colors in dark mode" switch sets the dark one; the colours button in
 * the PDF reader flips whichever applies to the theme on screen right now
 * (see PdfViewerScreen). Same keys and defaults as the web app.
 */
const DARK_STORAGE_KEY = 'sichos-kodesh:invert-pdf-dark-mode';
const LIGHT_STORAGE_KEY = 'sichos-kodesh:invert-pdf-light-mode';

function usePersistedFlag(storageKey: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [enabled, setEnabledState] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (!cancelled) setEnabledState(value == null ? fallback : value === 'true');
      })
      .catch(() => {
        // Best-effort persistence only.
      });
    return () => {
      cancelled = true;
    };
  }, [fallback, storageKey]);

  function setEnabled(next: boolean): void {
    setEnabledState(next);
    AsyncStorage.setItem(storageKey, String(next)).catch(() => {
      // Best-effort persistence only.
    });
  }

  return [enabled, setEnabled];
}

/** On by default - Settings' own switch, and the reader's default while dark mode is active. */
export function useInvertPdfInDarkMode(): [boolean, (next: boolean) => void] {
  return usePersistedFlag(DARK_STORAGE_KEY, true);
}

/** Off by default - only the reader's colours button ever turns it on. */
export function useInvertPdfInLightMode(): [boolean, (next: boolean) => void] {
  return usePersistedFlag(LIGHT_STORAGE_KEY, false);
}
