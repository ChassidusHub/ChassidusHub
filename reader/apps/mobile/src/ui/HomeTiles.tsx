import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from '../i18n/useTranslation';
import { hexWithAlpha } from './color';
import { AppText } from './Text';
import { useColors } from './theme';
import { row, textAlign } from './rtl';

interface TileProps {
  icon: LucideIcon;
  label: string;
  /** One short line on what is inside. */
  blurb?: string;
  onPress: () => void;
}

/**
 * A door into one part of the library (web:
 * `.home-tile`): its icon in a tinted well, its name, and what it holds in
 * a few words. Two to a row, in a `TileGrid`.
 */
export function HomeTile({ icon: Icon, label, blurb, onPress }: TileProps) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={blurb ? `${label}, ${blurb}` : label}
      style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? colors.cardHover : colors.cardBg }]}
    >
      <View style={[styles.well, { backgroundColor: hexWithAlpha(colors.accent, 0.14), alignSelf: isRtl ? 'flex-end' : 'flex-start' }]}>
        <Icon size={20} strokeWidth={2} color={colors.accent} />
      </View>
      <AppText numberOfLines={2} style={[styles.label, { color: colors.fg, textAlign: textAlign(isRtl) }]}>
        {label}
      </AppText>
      {blurb ? (
        <AppText numberOfLines={2} style={[styles.blurb, { color: colors.muted, textAlign: textAlign(isRtl) }]}>
          {blurb}
        </AppText>
      ) : null}
    </Pressable>
  );
}

/** Tiles two to a row (web: `.home-tiles`). */
export function TileGrid({ children }: { children: ReactNode }) {
  const { isRtl } = useTranslation();
  return <View style={[styles.grid, { flexDirection: row(isRtl) }]}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  tile: { flexGrow: 1, flexBasis: '46%', minHeight: 118, borderRadius: 14, padding: 14, gap: 6 },
  well: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  label: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  blurb: { fontSize: 13, lineHeight: 18 },
});
