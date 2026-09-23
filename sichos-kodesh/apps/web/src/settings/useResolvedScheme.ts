import { useSyncExternalStore } from 'react';

export type ResolvedScheme = 'light' | 'dark';

/** Which colours are on screen right now: a theme chosen in Settings (`data-theme` on <html>, see useTheme.ts), else the OS's own preference. */
export function readResolvedScheme(): ResolvedScheme {
  const chosen = document.documentElement.getAttribute('data-theme');
  if (chosen === 'dark' || chosen === 'light') return chosen;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener('change', onChange);
  // Settings writes the attribute directly (applyTheme), with no React state in between - watch the node itself.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    media?.removeEventListener('change', onChange);
    observer.disconnect();
  };
}

/** Live view of `readResolvedScheme` - for the one place that needs to react to the theme in JS rather than CSS (the PDF reader's colour toggle). */
export function useResolvedScheme(): ResolvedScheme {
  return useSyncExternalStore(subscribe, readResolvedScheme, () => 'light');
}
