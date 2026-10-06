import { useState } from 'react';
import type { AccentPresetId } from '@sichos-kodesh/design';
import { DEFAULT_ACCENT, accentPreset } from '@sichos-kodesh/design';

const STORAGE_KEY = 'sichos-kodesh:accent';

/** The theme color chosen in Settings; nothing saved, or a color a later version saved, is the default. */
export function readStoredAccent(): AccentPresetId {
  try {
    return accentPreset(localStorage.getItem(STORAGE_KEY)).id;
  } catch {
    return DEFAULT_ACCENT;
  }
}

/**
 * The theme color is `data-accent` on <html>, which theme-colors.css (from
 * @sichos-kodesh/design) turns into the accent variables for light and dark
 * alike - so, like the theme itself (see useTheme.ts), choosing one is a
 * DOM attribute and nothing needs to re-render. The default has no
 * attribute, as the default theme has none.
 */
export function applyAccent(accent: AccentPresetId): void {
  if (accent === DEFAULT_ACCENT) document.documentElement.removeAttribute('data-accent');
  else document.documentElement.setAttribute('data-accent', accent);
}

export function useAccent(): [AccentPresetId, (next: AccentPresetId) => void] {
  const [accent, setAccentState] = useState<AccentPresetId>(readStoredAccent);

  function setAccent(next: AccentPresetId): void {
    setAccentState(next);
    applyAccent(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort persistence only.
    }
  }

  return [accent, setAccent];
}
