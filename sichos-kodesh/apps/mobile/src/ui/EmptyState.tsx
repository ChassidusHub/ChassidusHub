import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { AppText } from './Text';
import { useColors } from './theme';

interface Props {
  /** A lucide icon at size 40 - rendered at 40% opacity, like the web's `.empty-state-icon`. */
  icon?: ReactNode;
  text: string;
}

/** Web: `.empty-state` - a centered, muted placeholder for a page with nothing to show yet. */
export function EmptyState({ icon, text }: Props) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <AppText style={[styles.text, { color: colors.muted }]}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: 24 },
  icon: { opacity: 0.4 },
  text: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
