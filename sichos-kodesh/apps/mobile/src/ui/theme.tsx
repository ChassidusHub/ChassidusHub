import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Design tokens - one-to-one with apps/web/src/index.css's `:root` custom
 * properties (light) and its `prefers-color-scheme: dark` block (dark).
 * Keep the two files in sync; every screen reads these through `useColors`
 * so a theme switch re-renders the whole app in the other palette.
 */
export interface Colors {
  /** Web: --bg */
  bg: string;
  /** Web: --bg-elevated */
  bgElevated: string;
  /** Web: --fg */
  fg: string;
  /** Web: --muted */
  muted: string;
  /** Web: --border */
  border: string;
  /** Web: --card-bg */
  cardBg: string;
  /** Web: --card-hover */
  cardHover: string;
  /** Web: --accent */
  accent: string;
  /** Web: --accent-fg */
  accentFg: string;
  /** Web: --danger */
  danger: string;
  /** Web: --danger-fg */
  dangerFg: string;
}

export const lightColors: Colors = {
  bg: '#fafafa',
  bgElevated: '#ffffff',
  fg: '#121212',
  muted: '#6a6a6a',
  border: '#e2e2e2',
  cardBg: '#f0f0f0',
  cardHover: '#e6e6e6',
  accent: '#1a8a4a',
  accentFg: '#ffffff',
  danger: '#b3261e',
  dangerFg: '#ffffff',
};

export const darkColors: Colors = {
  bg: '#0a0a0a',
  bgElevated: '#121212',
  fg: '#f5f5f5',
  muted: '#a7a7a7',
  border: '#282828',
  cardBg: '#181818',
  cardHover: '#282828',
  accent: '#1ed760',
  accentFg: '#0a0a0a',
  danger: '#f28b82',
  dangerFg: '#1a1a1a',
};

/**
 * The bundled UI face - android/app/src/main/assets/fonts/NotoSans.ttf and
 * NotoSans_bold.ttf, the same Noto Sans + Noto Sans Hebrew subsets the web
 * app self-hosts, merged into one family so Latin and Hebrew never fall
 * through to a different system font mid-string. React Native Android
 * resolves `fontWeight: '700'` to the `_bold` file automatically.
 */
export const FONT_FAMILY = 'NotoSans';

export type ThemeMode = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'sichos-kodesh:theme';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (next: ThemeMode) => void;
  /** The palette actually in effect - `mode` resolved against the OS setting when it's 'system'. */
  scheme: 'light' | 'dark';
  colors: Colors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && isThemeMode(stored)) setModeState(stored);
      })
      .catch(() => {
        // Best-effort persistence only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: 'light' | 'dark' = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
    return {
      mode,
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      setMode(next: ThemeMode) {
        setModeState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
          // Best-effort persistence only.
        });
      },
    };
  }, [mode, systemScheme]);

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
