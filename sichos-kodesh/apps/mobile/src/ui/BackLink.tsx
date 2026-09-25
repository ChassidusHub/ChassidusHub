import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { RootStackParamList } from '../navigation/types';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from './Text';
import { useColors } from './theme';
import { row } from './rtl';

/** The screen this BackLink falls back to when there's no real history to pop - the same "logical parent" every web screen passes as its `to`. */
export type BackTarget = { [K in keyof RootStackParamList]: { name: K; params: RootStackParamList[K] } }[keyof RootStackParamList];

interface Props {
  fallback: BackTarget;
  /** `true` renders a non-interactive, invisible copy - ScreenHeader's spacer that keeps the title centered. */
  spacer?: boolean;
}

/**
 * The back-navigation link every screen starts with - one shared
 * chevron+label so it reads as one design system (see the web's
 * BackLink.tsx). Prefers popping the real navigation stack ("go back to
 * wherever I actually came from") and only navigates to the fixed
 * `fallback` parent when there is nothing to pop - a fresh launch or a
 * notification tap straight into a deep screen.
 */
export function BackLink({ fallback, spacer = false }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const Chevron = isRtl ? ChevronRight : ChevronLeft;

  function handlePress(): void {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    // BackTarget already pairs each name with its own params; the overloads cannot see that through the union.
    (navigation.replace as (name: string, params?: object) => void)(fallback.name, fallback.params ?? undefined);
  }

  const content = (
    <>
      <Chevron size={18} strokeWidth={2.5} color={colors.muted} />
      <AppText style={[styles.label, { color: colors.muted }]}>{t.back}</AppText>
    </>
  );

  if (spacer) {
    return (
      <View style={[styles.link, { flexDirection: row(isRtl) }, styles.spacer]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {content}
      </View>
    );
  }

  return (
    <Pressable onPress={handlePress} hitSlop={8} style={[styles.link, { flexDirection: row(isRtl) }]} accessibilityRole="button" accessibilityLabel={t.back}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Web: `.back-link` - inline-flex, gap 2px, 15px/600, capitalized. */
  link: { alignItems: 'center', gap: 2, flexShrink: 0 },
  /** The label's line no taller than the chevron, and no font padding under it, so the two sit on one middle line. */
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600', textTransform: 'capitalize', includeFontPadding: false, textAlignVertical: 'center' },
  spacer: { opacity: 0 },
});
