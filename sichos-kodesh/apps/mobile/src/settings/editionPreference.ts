import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PdfEdition } from '@sichos-kodesh/catalog';

const STORAGE_KEY = 'sichos-kodesh:pdf-edition-preference';

function isValid(value: string | null): value is PdfEdition {
  return value === 'sichosKodesh' || value === 'sefer' || value === 'torasMenachem';
}

/**
 * The user's preferred printed/transcribed edition (Sichos Kodesh, Sefer
 * HaSichos/HaMaamarim, or Toras Menachem - three real, distinct hanachos,
 * not variants of each other) for occasions that have PDFs citing more
 * than one - see `packages/catalog`'s `classifyPdfEdition`. Persisted via
 * AsyncStorage; loads asynchronously (starts `null` until the stored
 * value resolves), matching AsyncStorage's own async API.
 */
export function useEditionPreference(): [PdfEdition | null, (next: PdfEdition | null) => void] {
  const [preference, setPreferenceState] = useState<PdfEdition | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!cancelled && isValid(value)) setPreferenceState(value);
      })
      .catch(() => {
        // Best-effort persistence only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setPreference(next: PdfEdition | null) {
    setPreferenceState(next);
    (next ? AsyncStorage.setItem(STORAGE_KEY, next) : AsyncStorage.removeItem(STORAGE_KEY)).catch(() => {
      // Best-effort persistence only.
    });
  }

  return [preference, setPreference];
}
