import { useState } from 'react';

export type Theme = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'sichos-kodesh:theme';

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'dark' || raw === 'light' ? raw : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Applying the DOM attribute lives in the setter itself, not a `useEffect`
 * reacting to state - `data-theme` on `<html>` is one shared node
 * regardless of which component's hook instance changed it, and every
 * visual reaction to it is pure CSS (see index.css), so no component
 * needs to re-render when the theme changes the way language does for its
 * translated text. That means this hook doesn't need Context: applying it
 * once on load (main.tsx) and again wherever the setting itself is
 * changed (SettingsScreen) is enough.
 */
export function applyTheme(theme: Theme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

/**
 * A temporary scheme for one screen (the PDF reader, whose chrome follows
 * the page colours while reading): applied to the same `data-theme`
 * attribute, but never stored - `null` puts the user's own saved choice
 * back. The screen that sets it clears it on the way out.
 */
export function applySchemeOverride(scheme: 'light' | 'dark' | null): void {
  if (scheme === null) applyTheme(readStored());
  else document.documentElement.setAttribute('data-theme', scheme);
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readStored);

  function setTheme(next: Theme): void {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort persistence only.
    }
  }

  return [theme, setTheme];
}
