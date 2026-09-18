import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { PressableProps } from 'react-native';
import { colors, radius, spacing } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends PressableProps {
  label: string;
  variant?: Variant;
}

/**
 * Branded button. Use for primary calls to action (primary) and
 * secondary/outline actions (secondary), or text-only ghost links (ghost).
 */
export function AppButton({ label, variant = 'primary', style, ...rest }: Props) {
  return (
    <Pressable style={({ pressed }) => [styles.base, variantStyles[variant], pressed && styles.pressed, style as object]} {...rest}>
      <Text style={[styles.label, labelVariant[variant]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: { opacity: 0.75 },
  label: { fontSize: 15, fontWeight: '600' as const },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.accent },
  ghost: { backgroundColor: 'transparent' },
});

const labelVariant = StyleSheet.create({
  primary: { color: colors.accentFg },
  secondary: { color: colors.accent },
  ghost: { color: colors.accent },
});
