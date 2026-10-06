import React, { useEffect, useState } from 'react';
import { contentPreset } from '@chassidushub-reader/app-core';
import { getLibrary, useCatalog } from '../catalog/catalogStore';
import { APP_VERSION } from '../changelog';
import { ContinueSection } from '../components/ContinueSection';
import { ReadingPlaces } from '../components/ReadingPlaces';
import { useDownload } from '../download/useDownload';
import { getDownloadStorageUsage } from '../download/downloadStorage';
import { libraryFileNames } from '../library/libraryDownloads';
import { useTranslation } from '../i18n/useTranslation';
import { useAppMode } from '../appMode/appMode';
import type { MineScreenProps } from '../navigation/types';
import { getOfflineFolder, useOfflineStatus } from '../offline/offlineJobs';
import { getPacksNative } from '../offline/packsNative';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SettingRow, SettingsGroup } from '../ui/settings/SettingsControls';
import { formatBytes } from '../utils/formatBytes';
import { presetLabel } from './SettingsScreen';

/**
 * The listener's own tab (web: MineScreen, `/me`): where they left off
 * listening and reading, their bookmarks, what is on this phone - packs, downloads and what downloads on its own -
 * then Settings and About, each row with its state as the value.
 */
export function MineScreen({ navigation }: MineScreenProps) {
  const catalog = useCatalog();
  const { t } = useTranslation();
  const { settings } = useDownload();
  const onlineMode = useAppMode() !== 'offline';
  const [usage, setUsage] = useState<number | null>(null);
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

  const offlineSummary = settings.autoDownloadEnabled ? t.autoDownloadSummaryOn(presetLabel(t, contentPreset(settings.contentTypes)), settings.wifiOnly) : t.autoDownloadSummaryOff;

  return (
    <Screen header={<ScreenHeader title={t.tabNames.mine} />}>
      <ContinueSection />
      <ReadingPlaces />

      <SettingsGroup title={t.offlineGroup} first>
        <SettingRow label={t.viewDownloadedLabel} value={usage != null ? formatBytes(usage) : undefined} chevron onPress={() => navigation.navigate('Downloaded')} first />
        {onlineMode && <SettingRow label={t.downloadSettingsTitle} value={offlineSummary} chevron onPress={() => navigation.navigate('DownloadSettings')} />}
        {packsAvailable && <SettingRow label={t.offlinePacksLink} value={offlineFolder ? t.offlineSummaryFolder : t.offlineSummaryNoFolder} chevron onPress={() => navigation.navigate('Offline')} />}
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow label={t.settingsTitle} chevron onPress={() => navigation.navigate('Settings')} first />
        <SettingRow label={t.aboutLink} value={t.aboutVersion(APP_VERSION)} chevron onPress={() => navigation.navigate('About')} />
      </SettingsGroup>
    </Screen>
  );
}
