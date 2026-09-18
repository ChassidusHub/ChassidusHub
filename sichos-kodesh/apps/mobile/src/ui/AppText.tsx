import React from 'react';
import { Text, StyleSheet } from 'react-native';
import type { TextProps } from 'react-native';
import { colors, typography } from './theme';

type Variant = 'titleLarge' | 'titleMedium' | 'titleSmall' | 'bodyLarge' | 'bodyMedium' | 'bodySmall' | 'caption' | 'label';
type Color = 'default' | 'secondary' | 'muted' | 'accent' | 'error';

interface Props extends TextProps {
  variant?: Variant;
  color?: Color;
}

/**
 * Typed text component. Use instead of raw <Text> so typography and color
 * stay consistent across screens.
 */
export function AppText({ variant = 'bodyMedium', color = 'default', style, ...rest }: Props) {
  return <Text style={[styles.base, variantStyles[variant], colorStyles[color], style]} {...rest} />;
}

const styles = StyleSheet.create({
  base: { color: colors.textDefault },
});

const variantStyles = StyleSheet.create({
  titleLarge: typography.titleLarge,
  titleMedium: typography.titleMedium,
  titleSmall: typography.titleSmall,
  bodyLarge: typography.bodyLarge,
  bodyMedium: typography.bodyMedium,
  bodySmall: typography.bodySmall,
  caption: typography.caption,
  label: typography.label,
});

const colorStyles = StyleSheet.create({
  default: { color: colors.textDefault },
  secondary: { color: colors.textSecondary },
  muted: { color: colors.textMuted },
  accent: { color: colors.accent },
  error: { color: colors.textError },
});
