/** Shared design tokens for the mobile app. */

export const colors = {
  primary: '#3366cc',
  primaryLight: '#668de0',
  textDefault: '#1a1a1a',
  textSecondary: '#666',
  textMuted: '#888',
  textError: '#a33',
  textLink: '#3366cc',
  backgroundDefault: '#fff',
  backgroundSubtle: '#f2f2f2',
  border: '#ccc',
  borderLight: '#eee',
  white: '#fff',
} as const;

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
