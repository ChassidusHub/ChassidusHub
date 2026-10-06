import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from './Text';
import { useColors } from './theme';
import { row } from './rtl';

/** Web: `.library-grid` - a collection's groups with short names (years, months, parshiyos), three to a row. */
export function GroupGrid({ children }: { children: ReactNode }) {
  const { isRtl } = useTranslation();
  return <View style={[styles.grid, { flexDirection: row(isRtl) }]}>{children}</View>;
}

/** Web: `.library-grid-tile` - a group's name with its count under it. */
export function GroupTile({ label, count, onPress }: { label: string; count: number; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count}`}
      style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? colors.cardHover : colors.cardBg }]}
    >
      <AppText numberOfLines={2} style={[styles.name, { color: colors.fg }]}>
        {label}
      </AppText>
      <AppText style={[styles.count, { color: colors.muted }]}>{count}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  /** Three to a row: a third of the width, less the two gaps. */
  tile: { flexBasis: '31%', flexGrow: 1, minHeight: 64, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', gap: 2 },
  name: { fontSize: 16, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
