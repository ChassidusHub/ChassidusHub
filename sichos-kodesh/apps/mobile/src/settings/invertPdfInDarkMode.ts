import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sichos-kodesh:invert-pdf-dark-mode';

/** On by default - only while dark mode itself is active (see PdfViewerScreen), so it improves the night-reading default without affecting light mode. Same key and default as the web app's own setting. */
export function useInvertPdfInDarkMode(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!cancelled) setEnabledState(value !== 'false');
      })
      .catch(() => {
        // Best-effort persistence only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setEnabled(next: boolean): void {
    setEnabledState(next);
    AsyncStorage.setItem(STORAGE_KEY, String(next)).catch(() => {
      // Best-effort persistence only.
    });
  }

  return [enabled, setEnabled];
}
