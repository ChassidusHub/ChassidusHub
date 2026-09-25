import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
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
 * A door into one part of the library on the home screen (web:
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

/** A small pill with an icon, three to a row: the farbrengens' ways in (web: `.home-chip`). */
export function HomeChip({ icon: Icon, label, onPress }: TileProps) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? colors.cardHover : colors.cardBg, flexDirection: row(isRtl) }]}
    >
      <Icon size={17} strokeWidth={2} color={colors.accent} />
      <AppText numberOfLines={1} style={[styles.chipLabel, { color: colors.fg }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** A plain link row inside a card, with a chevron toward where it goes (web: `.home-link`). */
export function HomeLink({ label, onPress, last = false }: { label: string; onPress: () => void; last?: boolean }) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  const Chevron = isRtl ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.link, { flexDirection: row(isRtl), borderBottomColor: colors.border }, last && styles.linkLast, pressed && styles.pressed]}
    >
      <AppText numberOfLines={2} style={[styles.linkLabel, { color: colors.fg, textAlign: textAlign(isRtl) }]}>
        {label}
      </AppText>
      <Chevron size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  tile: { flexGrow: 1, flexBasis: '46%', minHeight: 118, borderRadius: 14, padding: 14, gap: 6 },
  well: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  label: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  blurb: { fontSize: 13, lineHeight: 18 },
  chip: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 },
  chipLabel: { flexShrink: 1, fontSize: 14, fontWeight: '600' },
  link: { alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  linkLast: { borderBottomWidth: 0, paddingBottom: 2 },
  linkLabel: { flexShrink: 1, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
