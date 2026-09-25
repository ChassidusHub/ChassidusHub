import React from 'react';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { AppText } from './Text';
import { useColors } from './theme';

interface TextBlockProps {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}

/** Web: `h1` - 28px/700, 4px below. */
export function H1({ children, style }: TextBlockProps) {
  return <AppText style={[styles.h1, style]}>{children}</AppText>;
}

/** Web: `.subtitle` - muted 15px, 20px below. */
export function Subtitle({ children, style }: TextBlockProps) {
  const colors = useColors();
  return <AppText style={[styles.subtitle, { color: colors.muted }, style]}>{children}</AppText>;
}

/** Web: `.item-description` - the whole name above a page's date line, where the header shows it shortened. */
export function Description({ children, style }: TextBlockProps) {
  const colors = useColors();
  return <AppText style={[styles.description, { color: colors.fg }, style]}>{children}</AppText>;
}

/** Web: `.category-header` - muted 12px/700 uppercase eyebrow, 20px above and 8px below (`first` drops the top margin, like `.category:first-of-type`). */
export function CategoryHeader({ children, first = false, style }: TextBlockProps & { first?: boolean }) {
  const colors = useColors();
  return <AppText style={[styles.categoryHeader, { color: colors.muted }, first && styles.first, style]}>{children}</AppText>;
}

/** Web: `.tab-help` - muted 13px help line, 16px below. */
export function TabHelp({ children, style }: TextBlockProps) {
  const colors = useColors();
  return <AppText style={[styles.tabHelp, { color: colors.muted }, style]}>{children}</AppText>;
}

/** Web: `.gap-message` - danger-colored notice, 16px above. */
export function GapMessage({ children, style }: TextBlockProps) {
  const colors = useColors();
  return <AppText style={[styles.gapMessage, { color: colors.danger }, style]}>{children}</AppText>;
}

const styles = StyleSheet.create({
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 15, lineHeight: 21, marginBottom: 20 },
  description: { fontSize: 16, lineHeight: 23, marginBottom: 6 },
  categoryHeader: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.72, marginTop: 20, marginBottom: 8 },
  first: { marginTop: 0 },
  tabHelp: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  gapMessage: { fontSize: 16, lineHeight: 22, marginTop: 16 },
});
