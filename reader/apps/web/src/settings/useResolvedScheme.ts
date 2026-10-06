import { useSyncExternalStore } from 'react';

export type ResolvedScheme = 'light' | 'dark';

/**
 * The colours the user's own choice resolves to: a theme chosen in
 * Settings (localStorage, see useTheme.ts), else the OS preference. Read
 * from the stored choice rather than from `data-theme` on <html>, so a
 * screen's temporary override (applySchemeOverride) never feeds back into
 * the decision that produced it.
 */
export function readBaseScheme(): ResolvedScheme {
  try {
    const chosen = localStorage.getItem('chassidushub:theme');
    if (chosen === 'dark' || chosen === 'light') return chosen;
  } catch {
    // Fall through to the OS preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
}

/** Live view of `readBaseScheme` - for the one place that needs to react to the theme in JS rather than CSS (the PDF reader's colour toggle). The stored choice cannot change while that screen is open (Settings is another screen), so only the OS preference is watched. */
export function useBaseScheme(): ResolvedScheme {
  return useSyncExternalStore(subscribe, readBaseScheme, () => 'light');
}
