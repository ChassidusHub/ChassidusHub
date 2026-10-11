import { useCallback, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

/** The theme showing now: the reader's choice, else the system's. */
function current(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const listeners = new Set<() => void>();

/**
 * Light or dark, and the switch between them. The choice is kept in this
 * browser and set before paint by the script in root.tsx.
 */
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    (changed) => {
      listeners.add(changed);
      const system = matchMedia('(prefers-color-scheme: dark)');
      system.addEventListener('change', changed);
      return () => {
        listeners.delete(changed);
        system.removeEventListener('change', changed);
      };
    },
    current,
    () => 'light' as Theme,
  );
  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // A private window may refuse: the switch still holds for this visit.
    }
    for (const changed of listeners) changed();
  }, []);
  return [theme, toggle];
}
