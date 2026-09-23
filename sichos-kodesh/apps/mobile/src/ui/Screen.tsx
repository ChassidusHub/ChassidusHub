import React from 'react';
import { StyleSheet, View } from 'react-native';
// React Native's own SafeAreaView is a no-op on Android, and with edge-to-edge
// enabled (Android 15+ enforces it) screen content is drawn under the status
// bar. react-native-safe-area-context reads the real insets on both platforms.
import { SafeAreaView } from 'react-native-safe-area-context';
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
