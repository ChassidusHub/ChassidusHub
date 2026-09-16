import { useState } from 'react';

const STORAGE_KEY = 'sichos-kodesh:invert-pdf-dark-mode';
const CLASS_NAME = 'invert-pdf-dark';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Applying the DOM class lives in this standalone function, not a
 * `useEffect` - same reasoning as `applyTheme`: one shared class on
 * `<html>`, every visual reaction to it is pure CSS (see index.css's
 * `.invert-pdf-dark` rules, gated to only take effect while dark mode is
 * *actually* active), so applying it once before mount (main.tsx) and
 * again wherever the setting itself changes (SettingsScreen) is enough -
 * no Context needed.
 */
export function applyInvertPdfInDarkMode(enabled: boolean): void {
  document.documentElement.classList.toggle(CLASS_NAME, enabled);
}

/**
 * Off by default - inverting a PDF's colors for night reading is a real
 * preference some people want and others don't, not a safe universal
 * default. Only ever visually active while dark mode itself is on (see
 * index.css) - this can stay on across a theme switch without doing
 * anything in light mode.
 */
export function useInvertPdfInDarkMode(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(readStored);

  function setEnabled(next: boolean): void {
    setEnabledState(next);
    applyInvertPdfInDarkMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Best-effort persistence only.
    }
  }

  return [enabled, setEnabled];
}
