import { useEffect, useState } from 'react';
import { contentPreset } from '@chassidushub-reader/app-core';
import { APP_VERSION } from '../changelog';
import { ContinueSection } from '../components/ContinueSection';
import { ReadingPlaces } from '../components/ReadingPlaces';
import { ScreenHeader } from '../components/ScreenHeader';
import { SettingRow, SettingsGroup } from '../components/settings/SettingsControls';
import { getDownloadedBytes } from '../download/downloadManager';
import { useDownload } from '../download/useDownload';
import { useTranslation } from '../i18n/useLanguage';
import { presetLabel } from '../settings/presetLabel';
import { formatBytes } from '../utils/formatBytes';

/**
 * The listener's own tab: where they left off listening and reading, their
 * bookmarks, what is saved on this device and what gets saved on its own,
 * then Settings and About - each row with its state as the value, so it
 * reads without opening anything.
 */
export function MineScreen() {
  const { t } = useTranslation();
  const { settings } = useDownload();
  const [usage, setUsage] = useState<number | null>(null);

  useEffect(() => {
    void getDownloadedBytes()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  const offlineSummary = settings.autoDownloadEnabled ? t.autoDownloadSummaryOn(presetLabel(t, contentPreset(settings.contentTypes)), settings.wifiOnly) : t.autoDownloadSummaryOff;

  return (
    <div className="screen">
      <ScreenHeader title={t.tabNames.mine} />

      <ContinueSection />
      <ReadingPlaces />

      <SettingsGroup title={t.offlineGroup}>
        <SettingRow label={t.viewDownloadedLabel} value={usage != null ? formatBytes(usage) : undefined} to="/downloaded" />
        <SettingRow label={t.downloadSettingsTitle} value={offlineSummary} to="/settings/downloads" />
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow label={t.settingsTitle} to="/settings" />
        <SettingRow label={t.aboutLink} value={t.aboutVersion(APP_VERSION)} to="/about" />
      </SettingsGroup>
    </div>
  );
}
