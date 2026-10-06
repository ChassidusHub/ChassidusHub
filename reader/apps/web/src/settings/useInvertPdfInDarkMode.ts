import { useState } from 'react';
import type { ResolvedScheme } from './useResolvedScheme';

/**
 * Whether a PDF's pages are shown with their colours flipped (white text
 * on black), remembered separately for dark mode and for light mode: on
 * by default at night, off by default by day. Settings' "Invert PDF
 * colors in dark mode" switch sets the dark one; the colours button in
 * the PDF reader flips whichever applies to the theme on screen right
 * now (see PdfViewerScreen). Both keys are shared with the mobile app.
 */
const STORAGE_KEYS: Record<ResolvedScheme, string> = {
  dark: 'chassidushub:invert-pdf-dark-mode',
  light: 'chassidushub:invert-pdf-light-mode',
};
const DEFAULTS: Record<ResolvedScheme, boolean> = { dark: true, light: false };

export function readPdfInversion(scheme: ResolvedScheme): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[scheme]);
    return raw == null ? DEFAULTS[scheme] : raw === 'true';
  } catch {
    return DEFAULTS[scheme];
  }
}

function writePdfInversion(scheme: ResolvedScheme, value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS[scheme], String(value));
  } catch {
    // Best-effort persistence only.
  }
}

/** Both flags at once, so the reader can follow a theme switch without re-reading storage; `set` writes the one for `scheme`. */
export function usePdfInversion(): [(scheme: ResolvedScheme) => boolean, (scheme: ResolvedScheme, value: boolean) => void] {
  const [values, setValues] = useState<Record<ResolvedScheme, boolean>>(() => ({ dark: readPdfInversion('dark'), light: readPdfInversion('light') }));

  function set(scheme: ResolvedScheme, value: boolean): void {
    setValues((current) => ({ ...current, [scheme]: value }));
    writePdfInversion(scheme, value);
  }

  return [(scheme) => values[scheme], set];
}

/** Settings' own switch - the dark-mode flag alone. */
export function useInvertPdfInDarkMode(): [boolean, (next: boolean) => void] {
  const [get, set] = usePdfInversion();
  return [get('dark'), (next) => set('dark', next)];
}
