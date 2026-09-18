/**
 * Shared design tokens for the mobile app.
 * Light values mirror the web app's :root CSS variables; dark values mirror
 * the web @media (prefers-color-scheme: dark) block. Keep in sync with
 * apps/web/src/index.css.
 */

export const colorsLight = {
  /** Web: --accent */
  accent: '#1a8a4a',
  /** Web: --accent-fg */
  accentFg: '#ffffff',
  /** Web: --fg */
  textDefault: '#121212',
  /** Web: --muted */
  textSecondary: '#6a6a6a',
  textMuted: '#888',
  textError: '#b3261e',
  textLink: '#1a8a4a',
  /** Web: --bg */
  backgroundDefault: '#fafafa',
  /** Web: --bg-elevated */
  backgroundElevated: '#ffffff',
  /** Web: --card-bg */
  backgroundSubtle: '#f0f0f0',
  /** Web: --border */
  border: '#e2e2e2',
  borderLight: '#eeeeee',
  white: '#ffffff',
  /** Web: --danger */
  danger: '#b3261e',
} as const;

export const colorsDark = {
  accent: '#1ed760',
  accentFg: '#0a0a0a',
  textDefault: '#f5f5f5',
  textSecondary: '#a7a7a7',
  textMuted: '#888',
  textError: '#f28b82',
  textLink: '#1ed760',
  backgroundDefault: '#0a0a0a',
  backgroundElevated: '#121212',
  backgroundSubtle: '#181818',
  border: '#282828',
  borderLight: '#1e1e1e',
  white: '#ffffff',
  danger: '#f28b82',
} as const;

/** Default (light) colors for use in StyleSheet.create calls. */
export const colors = colorsLight;

export const typography = {
  titleLarge: { fontSize: 24, fontWeight: '600' as const },
  titleMedium: { fontSize: 22, fontWeight: '600' as const },
  titleSmall: { fontSize: 18, fontWeight: '600' as const },
  bodyLarge: { fontSize: 16 },
  bodyMedium: { fontSize: 15 },
  bodySmall: { fontSize: 14 },
  caption: { fontSize: 13 },
  label: { fontSize: 12 },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
} as const;
