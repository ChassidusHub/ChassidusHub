import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react-native';
import { accentPreset } from '@sichos-kodesh/design';
import { contentPreset } from '@sichos-kodesh/app-core';
import type { ContentPreset } from '@sichos-kodesh/app-core';
import { isBackgroundSyncAvailable, requestNotificationPermission } from '../background/backgroundNative';
import { getLibrary, useCatalog, useCatalogInfo } from '../catalog/catalogStore';
import { checkForCatalogUpdate, useCatalogUpdateStatus } from '../catalog/catalogUpdater';
import type { CatalogUpdateStatus } from '../catalog/catalogUpdater';
import { APP_VERSION } from '../changelog';
import { useDownload } from '../download/useDownload';
import { getDownloadStorageUsage } from '../download/downloadStorage';
import { libraryFileNames } from '../library/libraryDownloads';
import { useLanguage, useTranslation } from '../i18n/useTranslation';
import { setAppMode, useAppMode } from '../appMode/appMode';
import type { AppMode } from '../appMode/appMode';
import type { Language } from '../i18n/translations';
import type { SettingsScreenProps } from '../navigation/types';
import { useAutoplayOnHanacha } from '../settings/autoplayOnHanacha';
import { useInvertPdfInDarkMode } from '../settings/invertPdfInDarkMode';
import { useNotificationSettings } from '../settings/notificationSettings';
import { getOfflineFolder, useOfflineStatus } from '../offline/offlineJobs';
import { getPacksNative } from '../offline/packsNative';
import type { NotificationSettings } from '../settings/notificationSettings';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Spinner } from '../ui/Spinner';
import { Segmented, SettingRow, SettingsGroup, Toggle } from '../ui/settings/SettingsControls';
import { AccentPicker } from '../ui/settings/AccentPicker';
import { useColors, useTheme } from '../ui/theme';
import type { ThemeMode } from '../ui/theme';
import { formatBytes } from '../utils/formatBytes';

/** A language switch names each language in itself, whichever one is active. */
const LANGUAGE_NATIVE_NAMES: Record<Language, string> = { en: 'English', he: 'עברית' };

type Translation = ReturnType<typeof useTranslation>['t'];

/** The user-facing name of a "what to keep" preset (see contentPreset in app-core). Same as the web's settings/presetLabel.ts. */
export function presetLabel(t: Translation, preset: ContentPreset): string {
  return preset === 'essentials' ? t.presetEssentials : preset === 'everything' ? t.presetEverything : t.presetCustom;
}

/** The one line under "Update catalog" that says what the last check found - same wording as the web's About screen. */
export function catalogStatusLine(t: Translation, status: CatalogUpdateStatus): string {
  switch (status.phase) {
    case 'checking':
      return t.catalogChecking;
    case 'downloading':
      return t.catalogDownloading(status.version);
    case 'updated':
      return t.catalogUpdated(status.version);
    case 'up-to-date':
      return t.catalogUpToDate;
    case 'error':
      return t.catalogUpdateFailed;
    default:
      return t.catalogUpdateHelp;
  }
}

/**
 * Settings home (web: SettingsScreen): every quick preference as a real
 * control on this screen (theme, PDF colours, language, playback, and on
 * the phone the two notifications), and one row per screen that needs
 * more room (offline & downloads, downloaded content, about) with its
 * current state as the row's value.
 */
export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const catalog = useCatalog();
  const catalogInfo = useCatalogInfo();
  const catalogStatus = useCatalogUpdateStatus();
  const colors = useColors();
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { mode: theme, setMode: setTheme, accent, setAccent } = useTheme();
  const [autoplay, setAutoplay] = useAutoplayOnHanacha();
  const [invertPdf, setInvertPdf] = useInvertPdfInDarkMode();
  const [notifications, setNotifications] = useNotificationSettings();
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  const { settings } = useDownload();
  const onlineMode = useAppMode() !== 'offline';
  const [usage, setUsage] = useState<number | null>(null);
  // Phone only (see src/background) - a web app has no notifications of its own here.
  const notificationsAvailable = isBackgroundSyncAvailable();
  // Android only (see src/offline): packs, shared ZIPs and the station folder.
  const packsAvailable = getPacksNative() !== null;
  const { folder: offlineFolder } = useOfflineStatus();

  useEffect(() => {
    if (packsAvailable) getOfflineFolder().catch(() => undefined);
  }, [packsAvailable]);

  useEffect(() => {
    getDownloadStorageUsage(Object.values(catalog).flat(), libraryFileNames(getLibrary()))
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [catalog]);

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
  const modeOptions: Array<{ value: AppMode; label: string }> = [
    { value: 'online', label: t.modeOnline },
    { value: 'offline', label: t.modeOffline },
  ];
  const offlineSummary = settings.autoDownloadEnabled ? t.autoDownloadSummaryOn(presetLabel(t, contentPreset(settings.contentTypes)), settings.wifiOnly) : t.autoDownloadSummaryOff;

  return (
    <Screen header={<ScreenHeader back={{ name: 'Mine', params: undefined }} title={t.settingsTitle} />}>
      <SettingsGroup title={t.appearanceSection} first>
        <SettingRow label={t.themeLabel} stack first>
          <Segmented options={themeOptions} value={theme} onChange={setTheme} label={t.themeLabel} />
        </SettingRow>
        <SettingRow label={t.accentLabel} help={accentPreset(accent).name[language]} stack>
          <AccentPicker value={accent} onChange={setAccent} label={t.accentLabel} />
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

      {/* How this phone uses the app (appMode.ts): online downloads and says when the connection drops; offline pack mode takes everything from a pack and shows none of that. */}
      <SettingsGroup title={t.appModeSection} help={onlineMode ? t.modeOnlineHelp : t.modeOfflineHelp}>
        <SettingRow stack first>
          <Segmented options={modeOptions} value={onlineMode ? 'online' : 'offline'} onChange={setAppMode} label={t.appModeSection} />
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
          {onlineMode && (
            <SettingRow label={t.notifyDownloadsReadyLabel} onPress={() => toggleNotification('downloadsReady')}>
              <Toggle checked={notifications.downloadsReady} label={t.notifyDownloadsReadyLabel} decorative />
            </SettingRow>
          )}
        </SettingsGroup>
      )}

      {/* Importing a pack is here in every mode; the download settings only in online mode. */}
      <SettingsGroup title={t.offlineGroup}>
        {packsAvailable && <SettingRow label={t.offlinePacksLink} value={offlineFolder ? t.offlineSummaryFolder : t.offlineSummaryNoFolder} chevron onPress={() => navigation.navigate('Offline')} first />}
        {onlineMode && <SettingRow label={t.downloadSettingsTitle} value={offlineSummary} chevron onPress={() => navigation.navigate('DownloadSettings')} first={!packsAvailable} />}
        <SettingRow label={t.viewDownloadedLabel} value={usage != null ? formatBytes(usage) : undefined} chevron onPress={() => navigation.navigate('Downloaded')} first={!packsAvailable && !onlineMode} />
      </SettingsGroup>

      {/* The list of farbrengens itself has its own releases (packages/catalog) - the phone fetches a newer one from api.sk.chassidushub.org on its own once a day, and on demand here. */}
      <SettingsGroup title={t.catalogSection}>
        <SettingRow label={t.catalogVersionLabel} value={`${catalogInfo.version} · ${catalogInfo.source === 'bundled' ? t.catalogSourceBundled : t.catalogSourceUpdated}`} first />
        <SettingRow
          label={t.catalogUpdateLabel}
          help={catalogStatusLine(t, catalogStatus)}
          onPress={() => {
            checkForCatalogUpdate().catch(() => undefined);
          }}
        >
          {catalogStatus.phase === 'checking' || catalogStatus.phase === 'downloading' ? <Spinner size={18} color={colors.muted} /> : <RefreshCw size={18} color={colors.muted} />}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow label={t.aboutLink} value={t.aboutVersion(APP_VERSION)} chevron onPress={() => navigation.navigate('About')} first />
      </SettingsGroup>
    </Screen>
  );
}
