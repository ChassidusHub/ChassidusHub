import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { colors, spacing } from './theme';

interface Props {
  children: React.ReactNode;
  /** Extra horizontal/vertical padding override. */
  padded?: boolean;
  style?: object;
}

/**
 * Base screen wrapper - provides safe area insets and a consistent
 * background so every screen starts from the same baseline.
 */
export function Screen({ children, padded = false, style }: Props) {
  return (
    <SafeAreaView style={[styles.safeArea, style]}>
      <View style={[styles.container, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.backgroundDefault },
  container: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
