import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from './theme';

interface Props {
  title: string;
  /** Label for the leading back/close action. */
  backLabel?: string;
  /** Called when the back button is pressed. */
  onBack?: () => void;
  /** Optional right-side accessory (e.g. a settings icon). */
  right?: React.ReactNode;
}

/**
 * Minimal in-screen header. Used by screens that opt out of the native
 * stack header (headerShown: false) so they can control their own layout.
 */
export function ScreenHeader({ title, backLabel, onBack, right }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
            <Text style={styles.backText}>{backLabel ?? '< Back'}</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  left: { flex: 1, alignItems: 'flex-start' },
  title: { ...typography.bodyLarge, fontWeight: '600', color: colors.textDefault, flex: 2, textAlign: 'center' },
  right: { flex: 1, alignItems: 'flex-end' },
  backButton: { paddingVertical: 4 },
  backText: { color: colors.accent, fontSize: 15 },
});
