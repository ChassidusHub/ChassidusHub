import { useEffect, useState } from 'react';
import { contentPreset } from '@sichos-kodesh/app-core';
import { accentPreset } from '@sichos-kodesh/design';
import { useCatalogInfo } from '../catalog/catalogStore';
import { APP_VERSION } from '../changelog';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccentPicker } from '../components/settings/AccentPicker';
import { Segmented, SettingRow, SettingsGroup, Toggle } from '../components/settings/SettingsControls';
import { getDownloadedBytes } from '../download/downloadManager';
import { useDownload } from '../download/useDownload';
import { useLanguage, useTranslation } from '../i18n/useLanguage';
import type { Language } from '../i18n/translations';
import { presetLabel } from '../settings/presetLabel';
import { useAccent } from '../settings/useAccent';
import { useAutoplayOnHanacha } from '../settings/useAutoplayOnHanacha';
import { useInvertPdfInDarkMode } from '../settings/useInvertPdfInDarkMode';
import { useTheme } from '../settings/useTheme';
import type { Theme } from '../settings/useTheme';
import { formatBytes } from '../utils/formatBytes';

/** A language switch names each language in itself, whichever one is active. */
const LANGUAGE_NATIVE_NAMES: Record<Language, string> = { en: 'English', he: 'עברית' };

/**
 * Settings home: every quick preference as a real control on this page
 * (theme, PDF colours, language, playback), and one row per page that
 * needs more room (offline & downloads, downloaded content, about) with
 * its current state as the row's value - so the state of the app is
 * readable here without opening anything.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [theme, setTheme] = useTheme();
  const [accent, setAccent] = useAccent();
  const [autoplay, setAutoplay] = useAutoplayOnHanacha();
  const [invertPdf, setInvertPdf] = useInvertPdfInDarkMode();
  const { settings } = useDownload();
  const catalogInfo = useCatalogInfo();
  const [usage, setUsage] = useState<number | null>(null);

  useEffect(() => {
    void getDownloadedBytes()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  const themeOptions: Array<{ value: Theme; label: string }> = [
    { value: 'light', label: t.themeLight },
    { value: 'dark', label: t.themeDark },
    { value: 'system', label: t.themeSystem },
  ];
  const languageOptions = (['en', 'he'] as Language[]).map((value) => ({ value, label: LANGUAGE_NATIVE_NAMES[value] }));
  const offlineSummary = settings.autoDownloadEnabled ? t.autoDownloadSummaryOn(presetLabel(t, contentPreset(settings.contentTypes)), settings.wifiOnly) : t.autoDownloadSummaryOff;

  return (
    <div className="screen">
      <ScreenHeader to="/me" title={t.settingsTitle} />

      <SettingsGroup title={t.appearanceSection}>
        <SettingRow label={t.themeLabel} stack>
          <Segmented options={themeOptions} value={theme} onChange={setTheme} label={t.themeLabel} />
        </SettingRow>
        <SettingRow label={t.accentLabel} help={accentPreset(accent).name[language]} stack>
          <AccentPicker value={accent} onChange={setAccent} label={t.accentLabel} />
        </SettingRow>
        <SettingRow label={t.invertPdfDarkModeLabel} onClick={() => setInvertPdf(!invertPdf)}>
          <Toggle checked={invertPdf} label={t.invertPdfDarkModeLabel} decorative />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t.languageSection}>
        <SettingRow stack>
          <Segmented options={languageOptions} value={language} onChange={setLanguage} label={t.languageSection} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t.playbackSection}>
        <SettingRow label={t.autoplayHanachaLabel} help={t.autoplayHanachaHelp} onClick={() => setAutoplay(!autoplay)}>
          <Toggle checked={autoplay} label={t.autoplayHanachaLabel} decorative />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t.offlineGroup}>
        <SettingRow label={t.downloadSettingsTitle} value={offlineSummary} to="/settings/downloads" />
        <SettingRow label={t.viewDownloadedLabel} value={usage != null ? formatBytes(usage) : undefined} to="/downloaded" />
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow label={t.aboutLink} value={t.aboutVersion(APP_VERSION)} to="/about" />
        {/* No "update catalog" button on the web - it checks on its own (see catalogUpdater.ts); About shows what the last check found. */}
        <SettingRow label={t.catalogVersionLabel} value={`${catalogInfo.version} · ${catalogInfo.source === 'bundled' ? t.catalogSourceBundled : t.catalogSourceUpdated}`} to="/about" />
      </SettingsGroup>
    </div>
  );
}
