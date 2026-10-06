import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PackageOpen, Wifi } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { setAppMode } from '../appMode/appMode';
import type { AppMode } from '../appMode/appMode';
import { useLanguage, useTranslation } from '../i18n/useTranslation';
import type { Language } from '../i18n/translations';
import { Segmented } from '../ui/settings/SettingsControls';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row, textAlign } from '../ui/rtl';

/** A language switch names each language in itself, whichever one is active (as in Settings). */
const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', he: 'עברית' };

/**
 * The first thing a new phone sees: how it will use the app. Online, it
 * downloads and says when the connection drops; offline, everything comes
 * from an imported pack and none of that shows. Either can be changed later
 * in Settings, and a pack can be imported in both.
 */
export function ModeChooser() {
  const { t, isRtl } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const choice = (mode: AppMode, Icon: LucideIcon, title: string, body: string) => (
    <Pressable
      key={mode}
      accessibilityRole="button"
      onPress={() => setAppMode(mode)}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? colors.cardHover : colors.cardBg, borderColor: colors.border }]}
    >
      <View style={[styles.cardHead, { flexDirection: row(isRtl) }]}>
        <View style={[styles.iconWell, { backgroundColor: colors.bg }]}>
          <Icon size={22} color={colors.accent} />
        </View>
        <AppText style={[styles.cardTitle, { color: colors.fg, textAlign: textAlign(isRtl) }]}>{title}</AppText>
      </View>
      <AppText style={[styles.cardBody, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{body}</AppText>
    </Pressable>
  );

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={[styles.page, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.language}>
        <Segmented options={(['he', 'en'] as Language[]).map((value) => ({ value, label: LANGUAGE_NAMES[value] }))} value={language} onChange={setLanguage} label={t.languageSection} />
      </View>
      <AppText style={[styles.title, { color: colors.fg, textAlign: textAlign(isRtl) }]}>{t.modeChooserTitle}</AppText>
      <AppText style={[styles.lead, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{t.modeChooserLead}</AppText>
      <View style={styles.cards}>
        {choice('online', Wifi, t.modeOnline, t.modeOnlineHelp)}
        {choice('offline', PackageOpen, t.modeOffline, t.modeOfflineHelp)}
      </View>
      <AppText style={[styles.footnote, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{t.modeChooserFootnote}</AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, gap: 12 },
  language: { marginBottom: 20 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  cards: { gap: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 10 },
  cardHead: { alignItems: 'center', gap: 12 },
  iconWell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 19, lineHeight: 26, fontWeight: '700' },
  cardBody: { fontSize: 15, lineHeight: 22 },
  footnote: { fontSize: 13, lineHeight: 19, marginTop: 8 },
});
