import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from './theme';

interface Props {
  label: string;
}

/** Section header label — matches the web muted uppercase section style. */
export function SectionLabel({ label }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  text: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
