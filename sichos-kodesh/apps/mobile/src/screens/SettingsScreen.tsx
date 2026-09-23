import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { isBackgroundSyncAvailable, requestNotificationPermission } from '../background/backgroundNative';
import { useLanguage, useTranslation } from '../i18n/useTranslation';
import type { Language } from '../i18n/translations';
import type { SettingsScreenProps } from '../navigation/types';
import { useAutoplayOnHanacha } from '../settings/autoplayOnHanacha';
import { useInvertPdfInDarkMode } from '../settings/invertPdfInDarkMode';
import { useNotificationSettings } from '../settings/notificationSettings';
import type { NotificationSettings } from '../settings/notificationSettings';
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
  const [notifications, setNotifications] = useNotificationSettings();
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  // Phone only (see src/background) - a web app has no notifications of its own here.
  const notificationsAvailable = isBackgroundSyncAvailable();

  function toggleNotification(key: keyof NotificationSettings): void {
    const next = !notifications[key];
    if (!next) {
      setNotifications({ ...notifications, [key]: false });
      return;
    }
    // Turning one on is the moment Android 13+ asks; a refusal leaves it off and explains why.
    requestNotificationPermission()
      .then((granted) => {
        setNotificationsBlocked(!granted);
        if (granted) setNotifications({ ...notifications, [key]: true });
      })
      .catch(() => setNotificationsBlocked(true));
  }

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
        <Row key={option.value} label={option.label} marquee selected={theme === option.value} trailing={<OptionCheck checked={theme === option.value} />} onPress={() => setTheme(option.value)} />
      ))}

      <Row label={t.invertPdfDarkModeLabel} marquee selected={invertPdf} trailing={<OptionCheck checked={invertPdf} />} onPress={() => setInvertPdf(!invertPdf)} />

      <CategoryHeader>{t.languageSection}</CategoryHeader>
      {languageOptions.map((option) => (
        <Row key={option.value} label={option.label} marquee selected={language === option.value} trailing={<OptionCheck checked={language === option.value} />} onPress={() => setLanguage(option.value)} />
      ))}

      <CategoryHeader>{t.playbackSection}</CategoryHeader>
      <Row label={t.autoplayHanachaLabel} marquee selected={autoplay} trailing={<OptionCheck checked={autoplay} />} onPress={() => setAutoplay(!autoplay)} />
      <TabHelp>{t.autoplayHanachaHelp}</TabHelp>

      {notificationsAvailable && (
        <>
          <CategoryHeader>{t.notificationsSection}</CategoryHeader>
          <Row label={t.notifyNewWeekLabel} marquee selected={notifications.newWeek} trailing={<OptionCheck checked={notifications.newWeek} />} onPress={() => toggleNotification('newWeek')} />
          <TabHelp>{t.notifyNewWeekHelp}</TabHelp>
          <Row
            label={t.notifyDownloadsReadyLabel}
            marquee
            selected={notifications.downloadsReady}
            trailing={<OptionCheck checked={notifications.downloadsReady} />}
            onPress={() => toggleNotification('downloadsReady')}
          />
          {notificationsBlocked && <TabHelp>{t.notificationsBlockedHelp}</TabHelp>}
        </>
      )}

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
