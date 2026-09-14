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
