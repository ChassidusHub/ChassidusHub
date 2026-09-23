import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from './Text';
import { useColors } from './theme';
import { row } from './rtl';

interface Props {
  label: string;
  onPress?: () => void;
  /** Web: `.hero-button` - the home page's big green call to action. */
  hero?: boolean;
  /** Web: `.card .button:last-child { margin-bottom: 0 }` - a card's own Read button. */
  lastInCard?: boolean;
  /** A leading lucide icon, rendered in the button's own text color (ThisWeekScreen's "Download this week"). */
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The filled, pill-shaped `.button` used for every primary action - full
 * width, accent background, 15px/700 label, 16px of margin above and below.
 */
export function Button({ label, onPress, hero = false, lastInCard = false, icon, style }: Props) {
  const colors = useColors();
  const { isRtl } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.accent },
        hero && styles.hero,
        lastInCard && styles.lastInCard,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={[styles.content, { flexDirection: row(isRtl) }]}>
        {icon}
        <AppText style={[styles.label, { color: colors.accentFg }, hero && styles.heroLabel]}>{label}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Web: `.button` - radius 999, padding 11, margin 16px 0. */
  button: { width: '100%', borderRadius: 999, padding: 11, marginTop: 16, marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
  /** Web: `.hero-button` - padding 18, margin 20px 0 24px, 18px, radius 14. */
  hero: { padding: 18, marginTop: 20, marginBottom: 24, borderRadius: 14 },
  lastInCard: { marginBottom: 0 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  content: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  heroLabel: { fontSize: 18 },
});
