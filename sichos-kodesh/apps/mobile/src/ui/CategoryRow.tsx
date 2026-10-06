import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from './Text';
import { useColors } from './theme';
import { row } from './rtl';

interface Props {
  label: string;
  /** Web: `.category-row-count` - a muted 13px/500 count on the trailing side. */
  count?: ReactNode;
  /** Extra trailing content next to the count (FarbrengenScreen's recordings row puts its play button here). */
  trailing?: ReactNode;
  onPress: () => void;
  /** Web: `.settings-link-row` spacing when stacked in a `.settings-link-list`. */
  style?: object;
}

/**
 * The filled `.category-row` card-link: a 16px/700 label on a card-colored
 * rounded row, used for section links on an occasion's page, the home page's
 * navigation rows, and the Settings link list.
 */
export function CategoryRow({ label, count, trailing, onPress, style }: Props) {
  const colors = useColors();
  const { isRtl } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.cardHover : colors.cardBg, flexDirection: row(isRtl) }, style]}
    >
      <AppText numberOfLines={2} style={[styles.name, { color: colors.fg }]}>
        {label}
      </AppText>
      {(count !== undefined || trailing) && (
        <View style={[styles.trailing, { flexDirection: row(isRtl) }]}>
          {count !== undefined && <AppText style={[styles.count, { color: colors.muted }]}>{count}</AppText>}
          {trailing}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Web: `.category-row` - padding 16, margin-bottom 8, radius 10. */
  row: { justifyContent: 'space-between', alignItems: 'center', padding: 16, marginBottom: 8, borderRadius: 10, gap: 8 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700' },
  count: { fontSize: 13, fontWeight: '500' },
  /** Web: `.category-row-trailing` - gap 10. */
  trailing: { alignItems: 'center', gap: 10, flexShrink: 0 },
});
