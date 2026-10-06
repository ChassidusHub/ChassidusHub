import React from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { AppText } from './Text';
import { useColors } from './theme';

/** Web: `.card` - margin-bottom 12, padding 14, radius 10, card background. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.cardBg }, style]}>{children}</View>;
}

/** Web: `.pdf-label` - a card's own 15px/500 title line. */
export function PdfLabel({ children }: { children: ReactNode }) {
  return <AppText style={styles.pdfLabel}>{children}</AppText>;
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, padding: 14, borderRadius: 10 },
  pdfLabel: { fontSize: 15, fontWeight: '500', marginBottom: 10 },
});
