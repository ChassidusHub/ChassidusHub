import React, { useEffect, useState } from 'react';
import { contentPreset } from '@sichos-kodesh/app-core';
import type { ContentPreset } from '@sichos-kodesh/app-core';
import { isBackgroundSyncAvailable, requestNotificationPermission } from '../background/backgroundNative';
import catalog from '../catalog/data';
import { APP_VERSION } from '../changelog';
import { useDownload } from '../download/useDownload';
import { getDownloadStorageUsage } from '../download/downloadStorage';
import { useLanguage, useTranslation } from '../i18n/useTranslation';
import type { Language } from '../i18n/translations';
import type { SettingsScreenProps } from '../navigation/types';
import { useAutoplayOnHanacha } from '../settings/autoplayOnHanacha';
import { useInvertPdfInDarkMode } from '../settings/invertPdfInDarkMode';
import { useNotificationSettings } from '../settings/notificationSettings';
import type { NotificationSettings } from '../settings/notificationSettings';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Segmented, SettingRow, SettingsGroup, Toggle } from '../ui/settings/SettingsControls';
import { useTheme } from '../ui/theme';
import type { ThemeMode } from '../ui/theme';
import { formatBytes } from '../utils/formatBytes';

const ALL_ENTRIES = Object.values(catalog).flat();
/** A language switch names each language in itself, whichever one is active. */
const LANGUAGE_NATIVE_NAMES: Record<Language, string> = { en: 'English', he: 'עברית' };

type Translation = ReturnType<typeof useTranslation>['t'];

/** The user-facing name of a "what to keep" preset (see contentPreset in app-core). Same as the web's settings/presetLabel.ts. */
export function presetLabel(t: Translation, preset: ContentPreset): string {
  return preset === 'essentials' ? t.presetEssentials : preset === 'everything' ? t.presetEverything : t.presetCustom;
}

/**
 * Settings home (web: SettingsScreen): every quick preference as a real
 * control on this screen (theme, PDF colours, language, playback, and on
 * the phone the two notifications), and one row per screen that needs
 * more room (offline & downloads, downloaded content, about) with its
 * current state as the row's value.
 */
export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { mode: theme, setMode: setTheme } = useTheme();
  const [autoplay, setAutoplay] = useAutoplayOnHanacha();
  const [invertPdf, setInvertPdf] = useInvertPdfInDarkMode();
  const [notifications, setNotifications] = useNotificationSettings();
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  const { settings } = useDownload();
  const [usage, setUsage] = useState<number | null>(null);
  // Phone only (see src/background) - a web app has no notifications of its own here.
  const notificationsAvailable = isBackgroundSyncAvailable();

  useEffect(() => {
    getDownloadStorageUsage(ALL_ENTRIES)
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

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
    { value: 'light', label: t.themeLight },
    { value: 'dark', label: t.themeDark },
    { value: 'system', label: t.themeSystem },
  ];
  const languageOptions = (['en', 'he'] as Language[]).map((value) => ({ value, label: LANGUAGE_NATIVE_NAMES[value] }));
  const offlineSummary = settings.autoDownloadEnabled ? t.autoDownloadSummaryOn(presetLabel(t, contentPreset(settings.contentTypes)), settings.wifiOnly) : t.autoDownloadSummaryOff;

  return (
    <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title={t.settingsTitle} />}>
      <SettingsGroup title={t.appearanceSection} first>
        <SettingRow label={t.themeLabel} stack first>
          <Segmented options={themeOptions} value={theme} onChange={setTheme} label={t.themeLabel} />
        </SettingRow>
        <SettingRow label={t.invertPdfDarkModeLabel} onPress={() => setInvertPdf(!invertPdf)}>
          <Toggle checked={invertPdf} label={t.invertPdfDarkModeLabel} decorative />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t.languageSection}>
        <SettingRow stack first>
          <Segmented options={languageOptions} value={language} onChange={setLanguage} label={t.languageSection} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t.playbackSection}>
        <SettingRow label={t.autoplayHanachaLabel} help={t.autoplayHanachaHelp} onPress={() => setAutoplay(!autoplay)} first>
          <Toggle checked={autoplay} label={t.autoplayHanachaLabel} decorative />
        </SettingRow>
      </SettingsGroup>

      {notificationsAvailable && (
        <SettingsGroup title={t.notificationsSection} help={notificationsBlocked ? t.notificationsBlockedHelp : undefined}>
          <SettingRow label={t.notifyNewWeekLabel} help={t.notifyNewWeekHelp} onPress={() => toggleNotification('newWeek')} first>
            <Toggle checked={notifications.newWeek} label={t.notifyNewWeekLabel} decorative />
          </SettingRow>
          <SettingRow label={t.notifyDownloadsReadyLabel} onPress={() => toggleNotification('downloadsReady')}>
            <Toggle checked={notifications.downloadsReady} label={t.notifyDownloadsReadyLabel} decorative />
          </SettingRow>
        </SettingsGroup>
      )}

      <SettingsGroup title={t.offlineGroup}>
        <SettingRow label={t.downloadSettingsTitle} value={offlineSummary} chevron onPress={() => navigation.navigate('DownloadSettings')} first />
        <SettingRow label={t.viewDownloadedLabel} value={usage != null ? formatBytes(usage) : undefined} chevron onPress={() => navigation.navigate('Downloaded')} />
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow label={t.aboutLink} value={t.aboutVersion(APP_VERSION)} chevron onPress={() => navigation.navigate('About')} first />
      </SettingsGroup>
    </Screen>
  );
}
