import { useSyncExternalStore } from 'react';

/**
 * Light, dark, or as the device is: the reader's choice, kept in this
 * browser and set on <html data-theme> before the page is drawn (the
 * script below runs in <head>), so a dark page never flashes white. The
 * same for the face the words of the Torah are set in.
 */

export type Theme = 'light' | 'dark' | 'auto';
export type TextFont = 'frank' | 'david' | 'noto';

const THEME_KEY = 'chassidushub.theme';
const FONT_KEY = 'chassidushub.text-font';

const SIDE_KEY = 'chassidushub.sidebar';

/** Runs in <head> before anything is drawn. Kept tiny and free of imports. */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);var f=localStorage.getItem('${FONT_KEY}');if(f==='david'||f==='noto')d.setAttribute('data-text-font',f);if(localStorage.getItem('${SIDE_KEY}')==='folded')d.setAttribute('data-side','folded')}catch(e){}})();`;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // A private window: the choice holds for this visit.
  }
}

export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  write(THEME_KEY, theme === 'auto' ? null : theme);
  notify();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => {
      const t = read(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : 'auto';
    },
    () => 'auto',
  );
}

export function setTextFont(font: TextFont): void {
  const root = document.documentElement;
  if (font === 'frank') root.removeAttribute('data-text-font');
  else root.setAttribute('data-text-font', font);
  write(FONT_KEY, font === 'frank' ? null : font);
  notify();
}

export function useTextFont(): TextFont {
  return useSyncExternalStore(
    subscribe,
    () => {
      const f = read(FONT_KEY);
      return f === 'david' || f === 'noto' ? f : 'frank';
    },
    () => 'frank',
  );
}

/** Whether the page is dark now: the reader's choice, or the device's when they left it to the device. */
export function useDarkNow(): boolean {
  return useSyncExternalStore(
    (l) => {
      const off = subscribe(l);
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', l);
      return () => {
        off();
        media.removeEventListener('change', l);
      };
    },
    () => {
      const t = read(THEME_KEY);
      return t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    },
    () => false,
  );
}

/**
 * The sidebar on a wide screen: open, or folded to its icons. Kept in this
 * browser and set on <html data-side> before the page is drawn, like the theme.
 */
export function setSideFolded(folded: boolean): void {
  const root = document.documentElement;
  if (folded) root.setAttribute('data-side', 'folded');
  else root.removeAttribute('data-side');
  write(SIDE_KEY, folded ? 'folded' : null);
  notify();
}

export function useSideFolded(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(SIDE_KEY) === 'folded',
    () => false,
  );
}
