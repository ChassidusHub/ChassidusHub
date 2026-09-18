import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { ViewProps } from 'react-native';
import { colors, radius, spacing } from './theme';

interface Props extends ViewProps {
  children: React.ReactNode;
}

/** Rounded card wrapper — mirrors the web card-bg surface. */
export function Card({ children, style, ...rest }: Props) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
