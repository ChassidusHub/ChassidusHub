import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccentPresetId, Colors } from '@sichos-kodesh/design';
import { DEFAULT_ACCENT, accentPreset, themeColors } from '@sichos-kodesh/design';

/**
 * Design tokens - the colors every surface shares, from @sichos-kodesh/design
 * (the web reads the same values as CSS variables, apps/web/src/theme-colors.css):
 * warm neutrals per scheme, and the theme color the person chose in
 * Settings among its presets. Every screen reads them through `useColors`,
 * so a theme or color switch re-renders the whole app in the new palette.
 */
export type { Colors } from '@sichos-kodesh/design';

/** The palettes with the default theme color - for the few places that draw one scheme on purpose (the reader's "app" swatch, the PDF page in light). */
export const lightColors: Colors = themeColors('light', DEFAULT_ACCENT);
export const darkColors: Colors = themeColors('dark', DEFAULT_ACCENT);

/**
 * The bundled UI face - android/app/src/main/assets/fonts/NotoSans.ttf and
 * NotoSans_bold.ttf, the same Noto Sans + Noto Sans Hebrew subsets the web
 * app self-hosts, merged into one family so Latin and Hebrew never fall
 * through to a different system font mid-string. React Native Android
 * resolves `fontWeight: '700'` to the `_bold` file automatically.
 */
export const FONT_FAMILY = 'NotoSans';

/**
 * The display face (docs: the UI/UX redo plan, "Visual system"; web:
 * `--font-display`): Frank Ruhl Libre Bold, for the few titles that carry
 * a page - a tab's name, the parsha on This week, a sefer's or an item's
 * own name, the full player's title. Only its bold is bundled
 * (FrankRuhlLibre_bold.ttf, Hebrew and Latin in one file), so it is always
 * set with `fontWeight: '700'`.
 */
export const DISPLAY_FONT = 'FrankRuhlLibre';

export type ThemeMode = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'sichos-kodesh:theme';
const ACCENT_KEY = 'sichos-kodesh:accent';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (next: ThemeMode) => void;
  /** The palette actually in effect - `mode` resolved against the OS setting when it's 'system', unless a screen has overridden it (see `setSchemeOverride`). */
  scheme: 'light' | 'dark';
  /** The user's own choice resolved against the OS - what `scheme` is when nothing overrides it. */
  baseScheme: 'light' | 'dark';
  colors: Colors;
  /** The theme color chosen in Settings (web: `data-accent`). */
  accent: AccentPresetId;
  setAccent: (next: AccentPresetId) => void;
  /**
   * A temporary scheme for one screen (the PDF reader, whose chrome follows
   * the page colours while reading) - nothing is persisted, `mode` is
   * untouched, and `null` returns to the user's own choice. The screen
   * that sets it clears it on the way out.
   */
  setSchemeOverride: (next: 'light' | 'dark' | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [override, setSchemeOverride] = useState<'light' | 'dark' | null>(null);
  const [accent, setAccentState] = useState<AccentPresetId>(DEFAULT_ACCENT);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && isThemeMode(stored)) setModeState(stored);
      })
      .catch(() => {
        // Best-effort persistence only.
      });
    AsyncStorage.getItem(ACCENT_KEY)
      .then((stored) => {
        // An unknown color (saved by a later version) is the default.
        if (!cancelled && stored) setAccentState(accentPreset(stored).id);
      })
      .catch(() => {
        // Best-effort persistence only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const baseScheme: 'light' | 'dark' = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
    const scheme = override ?? baseScheme;
    return {
      mode,
      scheme,
      baseScheme,
      colors: themeColors(scheme, accent),
      accent,
      setAccent(next: AccentPresetId) {
        setAccentState(next);
        AsyncStorage.setItem(ACCENT_KEY, next).catch(() => {
          // Best-effort persistence only.
        });
      },
      setMode(next: ThemeMode) {
        setModeState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
          // Best-effort persistence only.
        });
      },
      setSchemeOverride,
    };
  }, [mode, override, systemScheme, accent]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

export function useColors(): Colors {
  return useTheme().colors;
}

/** Memoizes a palette-dependent StyleSheet per theme, so components can keep `StyleSheet.create` ergonomics while still re-theming live. */
export function useStyles<T>(factory: (colors: Colors) => T): T {
  const colors = useColors();
  return useMemo(() => factory(colors), [colors, factory]);
}

/** Spacing scale used across the mobile screens - values are the pixel sizes apps/web/src/index.css uses at 1rem = 16px. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;
