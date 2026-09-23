import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { OverflowMarquee } from './OverflowMarquee';
import { AppText } from './Text';
import { useColors } from './theme';
import { marginStart, row } from './rtl';

interface RowProps {
  label: string;
  /** Rendered on the far side of the row from the label - a date, a count, an icon group (see RowTrailing). */
  trailing?: ReactNode;
  /** Web: `.year-row-selected` - accent-colored label for a chosen settings option. */
  selected?: boolean;
  /** Web: `.settings-option-label` + OverflowMarquee - a label too long for the row scrolls instead of clipping to an ellipsis. */
  marquee?: boolean;
  /** Web: `.occasion-others-list .year-row-year` - a secondary row (muted, regular weight), e.g. the other farbrengens that share a matched occasion's date. */
  muted?: boolean;
  onPress?: () => void;
  /** Extra content below the label line - the home page's Continue rows put a date and progress track here. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The `.year-row` every list in the app is built from: a full-width tap
 * target, 17px/600 label, a hover/pressed wash that bleeds 10px past the
 * list's own edge on both sides (negative horizontal margin), and an
 * optional trailing group on the opposite side.
 */
export function Row({ label, trailing, selected = false, marquee = false, muted = false, onPress, children, style }: RowProps) {
  const colors = useColors();
  const { isRtl } = useTranslation();

  const labelStyle = [styles.label, { color: selected ? colors.accent : muted ? colors.muted : colors.fg }, muted && styles.labelMuted];
  const labelLine = (
    <>
      {marquee ? (
        <OverflowMarquee text={label} style={labelStyle} />
      ) : (
        <AppText numberOfLines={1} style={labelStyle}>
          {label}
        </AppText>
      )}
      {trailing}
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.cardHover }, style]}
    >
      {children ? (
        <View style={styles.column}>
          <View style={[styles.line, { flexDirection: row(isRtl) }]}>{labelLine}</View>
          {children}
        </View>
      ) : (
        <View style={[styles.line, { flexDirection: row(isRtl) }]}>{labelLine}</View>
      )}
    </Pressable>
  );
}

/** Web: `.year-row-trailing` - groups a row's trailing date with its icon(s), gap 6, 12px from the label. */
export function RowTrailing({ children }: { children: ReactNode }) {
  const { isRtl } = useTranslation();
  return <View style={[styles.trailing, { flexDirection: row(isRtl) }, marginStart(isRtl, 12)]}>{children}</View>;
}

/** Web: `.year-row-distance` - the muted, 14px/500 secondary text on a row's trailing side. */
export function RowDistance({ children, standalone = true }: { children: ReactNode; standalone?: boolean }) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  return <AppText style={[styles.distance, { color: colors.muted }, standalone && marginStart(isRtl, 12)]}>{children}</AppText>;
}

const styles = StyleSheet.create({
  /** Web: `.year-row` - padding 14px 10px, margin 0 -10px, radius 8. */
  row: { borderRadius: 8, paddingVertical: 14, paddingHorizontal: 10, marginHorizontal: -10 },
  line: { justifyContent: 'space-between', alignItems: 'center', minWidth: 0 },
  column: { gap: 6 },
  label: { flexShrink: 1, minWidth: 0, fontSize: 17, fontWeight: '600' },
  labelMuted: { fontWeight: '400' },
  trailing: { alignItems: 'center', gap: 6, flexShrink: 0 },
  distance: { fontSize: 14, fontWeight: '500', flexShrink: 0 },
});
