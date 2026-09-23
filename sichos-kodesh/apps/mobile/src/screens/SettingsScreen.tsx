import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useLanguage, useTranslation } from '../i18n/useTranslation';
import type { Language } from '../i18n/translations';
import type { SettingsScreenProps } from '../navigation/types';
import { useAutoplayOnHanacha } from '../settings/autoplayOnHanacha';
import { useInvertPdfInDarkMode } from '../settings/invertPdfInDarkMode';
import { CategoryRow } from '../ui/CategoryRow';
import { Row } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { CategoryHeader, TabHelp } from '../ui/Typography';
import { useColors, useTheme } from '../ui/theme';
import type { ThemeMode } from '../ui/theme';
import { marginStart } from '../ui/rtl';

/** Web: `.settings-option-end-slot` - a fixed 18px slot holding the check mark of a chosen option, so labels line up whether or not a row is selected. */
export function OptionCheck({ checked }: { checked: boolean }) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  return <View style={[styles.endSlot, marginStart(isRtl, 12)]}>{checked && <Check size={18} color={colors.muted} />}</View>;
}

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { mode: theme, setMode: setTheme } = useTheme();
  const [autoplay, setAutoplay] = useAutoplayOnHanacha();
  const [invertPdf, setInvertPdf] = useInvertPdfInDarkMode();

  const themeOptions: Array<{ value: ThemeMode; label: string }> = [
    { value: 'dark', label: t.themeDark },
    { value: 'light', label: t.themeLight },
    { value: 'system', label: t.themeSystem },
  ];
  const languageOptions: Array<{ value: Language; label: string }> = [
    { value: 'en', label: t.languageEnglish },
    { value: 'he', label: t.languageHebrew },
  ];

  return (
    <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title={t.settingsTitle} />}>
      <CategoryHeader first>{t.appearanceSection}</CategoryHeader>
      {themeOptions.map((option) => (
        <Row key={option.value} label={option.label} selected={theme === option.value} trailing={<OptionCheck checked={theme === option.value} />} onPress={() => setTheme(option.value)} />
      ))}

      <Row label={t.invertPdfDarkModeLabel} selected={invertPdf} trailing={<OptionCheck checked={invertPdf} />} onPress={() => setInvertPdf(!invertPdf)} />

      <CategoryHeader>{t.languageSection}</CategoryHeader>
      {languageOptions.map((option) => (
        <Row key={option.value} label={option.label} selected={language === option.value} trailing={<OptionCheck checked={language === option.value} />} onPress={() => setLanguage(option.value)} />
      ))}

      <CategoryHeader>{t.playbackSection}</CategoryHeader>
      <Row label={t.autoplayHanachaLabel} selected={autoplay} trailing={<OptionCheck checked={autoplay} />} onPress={() => setAutoplay(!autoplay)} />
      <TabHelp>{t.autoplayHanachaHelp}</TabHelp>

      <View style={styles.linkList}>
        <CategoryRow label={t.viewDownloadedLabel} onPress={() => navigation.navigate('Downloaded')} />
        <CategoryRow label={t.downloadsLink} onPress={() => navigation.navigate('DownloadSettings')} />
        <CategoryRow label={t.aboutLink} onPress={() => navigation.navigate('About')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  endSlot: { width: 18, minWidth: 18, alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
  /** Web: `.settings-link-list` - margin-top 8. */
  linkList: { marginTop: 8 },
});
