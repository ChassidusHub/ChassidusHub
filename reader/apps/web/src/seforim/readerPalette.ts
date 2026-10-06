import { READER_PALETTES, type ReaderPalette, type ReaderTheme } from '@chassidushub-reader/app-core';

/** The reader's colours: its own paper, or the site's own colours (its CSS variables, so light and dark both follow) for `app`. */
export function readerPalette(theme: ReaderTheme): ReaderPalette {
  if (theme === 'app') return { background: 'var(--bg)', text: 'var(--fg)', muted: 'var(--muted)', accent: 'var(--accent)', rule: 'var(--border)' };
  return READER_PALETTES[theme];
}

/** A font's CSS stack: the face itself, then the page's own. */
export function fontStack(family: string | null): string {
  return family ? `'${family}', 'Noto Sans Hebrew', serif` : 'inherit';
}
