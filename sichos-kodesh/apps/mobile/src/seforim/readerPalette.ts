import { READER_PALETTES, type ReaderPalette, type ReaderTheme } from '@sichos-kodesh/app-core';
import type { Colors } from '../ui/theme';

/** The reader's colours: its own paper, or the app's colours for `app`. */
export function readerPalette(theme: ReaderTheme, colors: Colors): ReaderPalette {
  if (theme === 'app') return { background: colors.bg, text: colors.fg, muted: colors.muted, accent: colors.accent, rule: colors.border };
  return READER_PALETTES[theme];
}

/** The app scheme the reader's chrome and status bar follow while a paper is on; null keeps the user's own. */
export function readerScheme(theme: ReaderTheme): 'light' | 'dark' | null {
  if (theme === 'night') return 'dark';
  if (theme === 'paper' || theme === 'sepia') return 'light';
  return null;
}
