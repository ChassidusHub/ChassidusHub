import React from 'react';
import { Pressable, Share, StyleSheet } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { WEB_APP_BASE_URL } from '../config';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';

interface Props {
  title: string;
  hebrewYear: number;
  occasionId: number;
}

/**
 * Shares a link to this occasion's page on the web app - the one canonical,
 * kind-independent URL every occasion has there (`/browse/:year/:id`).
 * Mirrors the web's ShareButton, using the OS share sheet instead of the Web
 * Share API.
 */
export function ShareButton({ title, hebrewYear, occasionId }: Props) {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const url = `${WEB_APP_BASE_URL}/browse/${hebrewYear}/${occasionId}`;

  function handleShare(): void {
    Share.share({ message: `${title}\n${url}`, url, title }).catch(() => undefined);
  }

  return (
    <Pressable onPress={handleShare} hitSlop={6} accessibilityRole="button" style={({ pressed }) => [styles.button, { flexDirection: row(isRtl) }, pressed && styles.pressed]}>
      <Share2 size={16} color={colors.muted} />
      <AppText style={[styles.label, { color: colors.muted }]}>{t.shareLabel}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Web: `.share-button` - inline-flex, gap 6, margin-bottom 12, muted 14px/600. */
  button: { alignSelf: 'flex-start', alignItems: 'center', gap: 6, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
