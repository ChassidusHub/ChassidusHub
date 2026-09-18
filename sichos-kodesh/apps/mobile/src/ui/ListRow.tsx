import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PressableProps } from 'react-native';
import { colors, spacing } from './theme';

interface Props extends PressableProps {
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
}

/**
 * Standard list row with optional sublabel and right accessory.
 * Mirrors the web list-item visual pattern: comfortable tap target,
 * consistent padding and hairline separator (rendered externally via
 * FlatList/SectionList ItemSeparatorComponent or wrapped in a parent).
 */
export function ListRow({ label, sublabel, right, style, ...rest }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style as object]}
      {...rest}
    >
      <View style={styles.labelGroup}>
        <Text style={styles.label}>{label}</Text>
        {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </Pressable>
  );
}

export function RowSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: { backgroundColor: colors.backgroundSubtle },
  labelGroup: { flex: 1 },
  label: { fontSize: 16, color: colors.textDefault },
  sublabel: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  right: { marginLeft: spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.lg },
});
