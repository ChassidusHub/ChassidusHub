import { useState } from 'react';
import type { PdfEdition } from '@sichos-kodesh/catalog';

const STORAGE_KEY = 'sichos-kodesh:pdf-edition-preference';

function readStored(): PdfEdition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'sefer' || raw === 'torasMenachem' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * The user's preferred printed edition (Sefer HaSichos/HaMaamarim vs.
 * Toras Menachem) for occasions that have PDFs citing both - see
 * `packages/catalog`'s `classifyPdfEdition`. Persisted per-browser via
 * localStorage (best-effort: a private/blocked-storage browser just
 * falls back to no preference for that session instead of throwing).
 */
export function useEditionPreference(): [PdfEdition | null, (next: PdfEdition | null) => void] {
  const [preference, setPreference] = useState<PdfEdition | null>(readStored);

  function update(next: PdfEdition | null) {
    setPreference(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best-effort persistence only.
    }
  }

  return [preference, update];
}
