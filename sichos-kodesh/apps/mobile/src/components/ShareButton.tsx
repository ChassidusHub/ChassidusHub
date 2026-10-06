import React from 'react';
import { Pressable, Share, StyleSheet } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { WEB_APP_BASE_URL } from '../config';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';
import { actionPillStyles } from './OccasionActions';

interface Props {
  title: string;
  hebrewYear: number;
  occasionId: number;
}

/**
 * Shares a link to this occasion's page on the web app - the one canonical,
 * kind-independent URL every occasion has there (`/f/:year/:id`; web: routes/links.ts).
 * Mirrors the web's ShareButton, using the OS share sheet instead of the Web
 * Share API. Rendered as one of the matching pills in OccasionActions -
 * never on its own - so Share and Download always sit side by side in the
 * same shape.
 */
export function ShareButton({ title, hebrewYear, occasionId }: Props) {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const url = `${WEB_APP_BASE_URL}/f/${hebrewYear}/${occasionId}`;

  function handleShare(): void {
    Share.share({ message: `${title}\n${url}`, url, title }).catch(() => undefined);
  }

  return (
    <Pressable
      onPress={handleShare}
      hitSlop={6}
      accessibilityRole="button"
      style={({ pressed }) => [actionPillStyles.pill, { flexDirection: row(isRtl), borderColor: colors.border, backgroundColor: pressed ? colors.cardBg : colors.bg }]}
    >
      <Share2 size={16} color={colors.fg} />
      <AppText style={[styles.label, { color: colors.fg }]}>{t.shareLabel}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600' },
});
