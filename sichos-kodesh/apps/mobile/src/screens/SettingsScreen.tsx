import React from 'react';
import { ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import type { PdfEdition } from '@sichos-kodesh/catalog';
import { useTranslation, useLanguage } from '../i18n/useTranslation';
import type { Language } from '../i18n/translations';
import type { SettingsScreenProps } from '../navigation/types';
import { useAutoplayOnHanacha } from '../settings/autoplayOnHanacha';
import { useEditionPreference } from '../settings/editionPreference';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SectionLabel } from '../ui/SectionLabel';
import { spacing } from '../ui/theme';

const OPTIONS: Array<{ value: PdfEdition | null; labelKey: 'pdfEditionNoPreference' | 'sichosKodeshEditionLabel' | 'pdfEditionSefer' | 'torasMenachemEditionLabel'; sublabelKey: 'pdfEditionNoPreferenceHelp' | 'pdfEditionSichosKodeshHelp' | 'pdfEditionSeferHelp' | 'pdfEditionTorasMenachemHelp' }> = [
  { value: null, labelKey: 'pdfEditionNoPreference', sublabelKey: 'pdfEditionNoPreferenceHelp' },
  { value: 'sichosKodesh', labelKey: 'sichosKodeshEditionLabel', sublabelKey: 'pdfEditionSichosKodeshHelp' },
  { value: 'sefer', labelKey: 'pdfEditionSefer', sublabelKey: 'pdfEditionSeferHelp' },
  { value: 'torasMenachem', labelKey: 'torasMenachemEditionLabel', sublabelKey: 'pdfEditionTorasMenachemHelp' },
];

const LANGUAGE_OPTIONS: Array<{ value: Language; labelKey: 'languageEnglish' | 'languageHebrew' }> = [
  { value: 'en', labelKey: 'languageEnglish' },
  { value: 'he', labelKey: 'languageHebrew' },
];

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { t, isRtl } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [preference, setPreference] = useEditionPreference();
  const [autoplay, setAutoplay] = useAutoplayOnHanacha();
  const systemScheme = useColorScheme();

  return (
    <Screen>
      <ScreenHeader title={t.settingsTitle} onBack={() => navigation.goBack()} backLabel={t.back} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel label={t.languageSection} />
        <View style={styles.cardWrap}>
          <Card style={styles.cardReset}>
            {LANGUAGE_OPTIONS.map((option, index) => (
              <React.Fragment key={option.value}>
                {index > 0 ? <RowSeparator /> : null}
                <ListRow
                  label={t[option.labelKey]}
                  right={language === option.value ? <AppText color="accent">✓</AppText> : null}
                  onPress={() => setLanguage(option.value)}
                />
              </React.Fragment>
            ))}
          </Card>
        </View>

        <SectionLabel label={t.pdfEditionPreferenceSection} />
        <AppText variant="bodySmall" color="muted" style={[styles.sectionHelp, isRtl && styles.textRight]}>
          {t.pdfEditionPreferenceHelp}
        </AppText>
        <View style={styles.cardWrap}>
          <Card style={styles.cardReset}>
            {OPTIONS.map((option, index) => (
              <React.Fragment key={String(option.value)}>
                {index > 0 ? <RowSeparator /> : null}
                <ListRow
                  label={t[option.labelKey]}
                  sublabel={t[option.sublabelKey]}
                  right={preference === option.value ? <AppText color="accent">✓</AppText> : null}
                  onPress={() => setPreference(option.value)}
                />
              </React.Fragment>
            ))}
          </Card>
        </View>

        <SectionLabel label={t.appearanceSection} />
        <View style={styles.cardWrap}>
          <Card>
            <AppText variant="bodyMedium">{t.themeSystem}</AppText>
            <AppText variant="bodySmall" color="muted" style={[styles.cardHelp, isRtl && styles.textRight]}>
              {t.appearanceFollowsSystem(systemScheme === 'dark' ? t.themeDark : t.themeLight)}
            </AppText>
          </Card>
        </View>

        <SectionLabel label={t.playbackSection} />
        <View style={styles.cardWrap}>
          <Card style={styles.cardReset}>
            <ListRow
              label={t.autoplayHanachaLabel}
              sublabel={t.autoplayHanachaHelp}
              right={autoplay ? <AppText color="accent">✓</AppText> : null}
              onPress={() => setAutoplay(!autoplay)}
            />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  sectionHelp: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  textRight: { textAlign: 'right' },
  cardWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  cardReset: { paddingVertical: 0, paddingHorizontal: 0 },
  cardHelp: { marginTop: spacing.xs, lineHeight: 19 },
});
