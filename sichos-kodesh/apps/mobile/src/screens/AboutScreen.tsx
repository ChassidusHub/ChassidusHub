import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Headphones, KeyRound, RefreshCw } from 'lucide-react-native';
import { APP_VERSION, CHANGELOG } from '../changelog';
import { useTranslation } from '../i18n/useTranslation';
import type { AboutScreenProps } from '../navigation/types';
import { CategoryRow } from '../ui/CategoryRow';
import { Row } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { AppText } from '../ui/Text';
import { CategoryHeader, Subtitle, TabHelp } from '../ui/Typography';
import { useColors } from '../ui/theme';
import { marginStart, row } from '../ui/rtl';

/** Same two credit links as apps/web/src/screens/AboutScreen.tsx. */
const MAFTEIACH_URL = 'https://mafteiach.app';
const ASHREINU_URL = 'https://ashreinu.app';
const PLAY_STORE_URL = 'market://details?id=com.sichoskodeshmobile';
const PLAY_STORE_WEB_URL = 'https://play.google.com/store/apps/details?id=com.sichoskodeshmobile';

function openUrl(url: string, fallback?: string): void {
  Linking.openURL(url).catch(() => {
    if (fallback) Linking.openURL(fallback).catch(() => undefined);
  });
}

/** Web: `.about-badge` - a store-badge-style chip that stays the same in light and dark mode alike. */
function Badge({ icon, eyebrow, name, onPress }: { icon: React.ReactNode; eyebrow: string; name: string; onPress: () => void }) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.badge, { backgroundColor: colors.accent, flexDirection: row(isRtl) }, pressed && styles.pressed]}>
      {icon}
      <View>
        <AppText style={[styles.badgeEyebrow, { color: colors.accentFg }]}>{eyebrow}</AppText>
        <AppText style={[styles.badgeName, { color: colors.accentFg }]}>{name}</AppText>
      </View>
    </Pressable>
  );
}

export function AboutScreen({ navigation }: AboutScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const latest = CHANGELOG[0]!;

  return (
    <Screen header={<ScreenHeader back={{ name: 'Settings', params: undefined }} title={t.aboutTitle} />}>
      <Subtitle>
        {t.aboutIndexedBy}
        <AppText style={[styles.strong, { color: colors.muted }]}>mafteiach.app</AppText>
        {t.aboutIndexedBySuffix}
      </Subtitle>
      <Subtitle>
        {t.aboutAudioBy}
        <AppText style={[styles.strong, { color: colors.muted }]}>JEM</AppText>
        {t.aboutAudioBySuffix}
      </Subtitle>

      <CategoryHeader>{t.aboutPoweredBy}</CategoryHeader>
      <View style={[styles.badges, { flexDirection: row(isRtl) }]}>
        <Badge icon={<KeyRound size={20} color={colors.accentFg} />} eyebrow={t.aboutMafteiachBadgeEyebrow} name={t.aboutMafteiachBadgeName} onPress={() => openUrl(MAFTEIACH_URL)} />
        <Badge icon={<Headphones size={20} color={colors.accentFg} />} eyebrow={t.aboutAshreinuBadgeEyebrow} name={t.aboutAshreinuBadgeName} onPress={() => openUrl(ASHREINU_URL)} />
      </View>

      <View style={styles.linkList}>
        <CategoryRow label={t.privacyLink} onPress={() => navigation.navigate('Privacy')} />
      </View>

      <CategoryHeader>{t.aboutVersion(APP_VERSION)}</CategoryHeader>
      <AppText style={styles.whatsNewTitle}>{t.aboutWhatsNew}</AppText>
      <View style={marginStart(isRtl, 20)}>
        {(language === 'he' ? latest.he : latest.en).map((line) => (
          <View key={line} style={[styles.changelogItem, { flexDirection: row(isRtl) }]}>
            <AppText style={[styles.bullet, { color: colors.muted }]}>•</AppText>
            <AppText style={[styles.changelogText, { color: colors.muted }]}>{line}</AppText>
          </View>
        ))}
      </View>

      <CategoryHeader>{t.aboutUpdateSection}</CategoryHeader>
      <Row label={t.aboutCheckForUpdate} trailing={<RefreshCw size={18} color={colors.muted} />} onPress={() => openUrl(PLAY_STORE_URL, PLAY_STORE_WEB_URL)} />
      <TabHelp>{t.aboutUpdatesViaPlay}</TabHelp>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: '700' },
  /** Web: `.about-badges` - wrap, gap 10, margin-bottom 8. */
  badges: { flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  badge: { alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  badgeEyebrow: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.75, lineHeight: 13 },
  badgeName: { fontSize: 15, fontWeight: '700', lineHeight: 19 },
  pressed: { opacity: 0.92 },
  linkList: { marginTop: 8 },
  whatsNewTitle: { fontWeight: '700', marginBottom: 6 },
  changelogItem: { gap: 8, marginBottom: 6 },
  bullet: { fontSize: 16, lineHeight: 22 },
  changelogText: { flex: 1, fontSize: 16, lineHeight: 22 },
});
