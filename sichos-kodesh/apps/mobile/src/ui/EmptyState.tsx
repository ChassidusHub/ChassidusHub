import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from './theme';

interface Props {
  title: string;
  body?: string;
}

/** Centered empty/zero-state message. Use when a list has no items. */
export function EmptyState({ title, body }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
