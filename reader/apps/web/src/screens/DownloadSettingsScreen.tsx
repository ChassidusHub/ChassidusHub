import { useEffect, useState } from 'react';
import { browsableYears, currentHebrewYear } from '@chassidushub-reader/catalog';
import type { PdfEdition } from '@chassidushub-reader/catalog';
import { contentPreset, presetContentTypes } from '@chassidushub-reader/app-core';
import type { ContentPreset } from '@chassidushub-reader/app-core';
import { findMatchingYears } from '@chassidushub-reader/kvius-engine';
import { useCatalog } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { Chips, Segmented, SettingRow, SettingsGroup, Toggle } from '../components/settings/SettingsControls';
import { useDownload } from '../download/useDownload';
import { MEDIA_CACHE_NAME } from '../download/cacheName';
import { getDownloadedBytes } from '../download/downloadManager';
import { clearAutoDownloadLedger } from '../download/downloadLedger';
import { clearPendingChapterDownloads } from '../download/pendingDownloads';
import { clearPendingEntryDownloads } from '../download/pendingEntryDownloads';
import { resolveAutoDownloadEntries } from '../download/useAutoDownloadSync';
import type { DownloadScope, RetentionPeriod, SourceYearMode } from '../settings/useDownloadSettings';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { formatBytes } from '../utils/formatBytes';
import { useTranslation } from '../i18n/useLanguage';
import { presetLabel } from '../settings/presetLabel';

const HANACHA_EDITIONS: PdfEdition[] = ['sichosKodesh', 'torasMenachem'];
const RETENTION_PERIODS: RetentionPeriod[] = ['never', '2w', '4w', '8w', '12w'];

/**
 * Offline & downloads (`/settings/downloads`): three plain questions -
 * keep this week ready? what to keep? which year? - each one control,
 * with the rarely-touched knobs (month scope, gap filling, cleanup, what
 * a manual download takes) behind an Advanced switch, and storage at the
 * bottom. The week-scope kvius fallback uses the same source-year
 * preference as `resolveWeekWithFallback`.
 */
export function DownloadSettingsScreen() {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const { settings, setSettings, enqueueBulk } = useDownload();
  const [usage, setUsage] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customChosen, setCustomChosen] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    void getDownloadedBytes()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [settings]); // Depends on `settings` too, so usage refreshes after actions like clearing downloads.

  const matchedYears = findMatchingYears(currentHebrewYear())
    .map((m) => m.hebrewYear)
    .sort((a, b) => a - b);
  const allYears = browsableYears(catalog);
  const preset = contentPreset(settings.contentTypes);
  const showCustom = preset === 'custom' || customChosen;

  function choosePreset(next: ContentPreset): void {
    if (next === 'custom') {
      setCustomChosen(true);
      return;
    }
    setCustomChosen(false);
    setSettings({ ...settings, contentTypes: presetContentTypes(next) });
  }

  function toggleManualYear(year: number): void {
    const enabled = settings.manualSourceYears.includes(year);
    const manualSourceYears = enabled ? settings.manualSourceYears.filter((y) => y !== year) : [...settings.manualSourceYears, year].sort((a, b) => a - b);
    setSettings({ ...settings, manualSourceYears });
  }

  function chooseSourceYearMode(mode: SourceYearMode): void {
    setSettings({
      ...settings,
      sourceYearMode: mode,
      manualSourceYears: mode === 'manual' && settings.manualSourceYears.length === 0 && matchedYears[0] != null ? [matchedYears[0]] : settings.manualSourceYears,
    });
  }

  function toggleEdition(edition: PdfEdition): void {
    const enabled = settings.contentTypes.hanachaEditions.includes(edition);
    const hanachaEditions = enabled ? settings.contentTypes.hanachaEditions.filter((e) => e !== edition) : [...settings.contentTypes.hanachaEditions, edition];
    setSettings({ ...settings, contentTypes: { ...settings.contentTypes, hanachaEditions } });
  }

  function toggleSection(section: 'audio' | 'mugah' | 'maamorim' | 'hagahos' | 'hosofos'): void {
    setSettings({ ...settings, contentTypes: { ...settings.contentTypes, [section]: !settings.contentTypes[section] } });
  }

  function downloadNow(): void {
    const entries = resolveAutoDownloadEntries(settings, new Date());
    if (entries.length > 0) enqueueBulk(entries, 'manual');
    setDownloadStarted(true);
  }

  async function clearDownloads(): Promise<void> {
    await caches.delete(MEDIA_CACHE_NAME);
    clearAutoDownloadLedger();
    // Without these, a download that happened to still be pending at the
    // exact moment of clearing would silently come back on the next app
    // open (see pendingDownloads.ts/pendingEntryDownloads.ts).
    clearPendingChapterDownloads();
    clearPendingEntryDownloads();
    setConfirmingClear(false);
    setUsage(await getDownloadedBytes().catch(() => 0));
  }

  const presetOptions = (['essentials', 'everything', 'custom'] as ContentPreset[]).map((value) => ({ value, label: presetLabel(t, value) }));
  const scopeOptions: Array<{ value: DownloadScope; label: string }> = [
    { value: 'week', label: t.downloadScopeWeek },
    { value: 'month', label: t.downloadScopeMonth },
  ];
  const yearModeOptions: Array<{ value: SourceYearMode; label: string }> = [
    { value: 'auto', label: t.sourceYearAutoLabel },
    { value: 'manual', label: t.sourceYearManualLabel },
  ];
  const retentionOptions = RETENTION_PERIODS.map((value) => ({ value, label: value === 'never' ? t.retentionNeverShort : t.retentionWeeksShort(Number(value.slice(0, -1))) }));

  return (
    <div className="screen">
      <ScreenHeader to="/settings" title={t.downloadSettingsTitle} />

      <button type="button" className="button" onClick={downloadNow}>
        {t.downloadNowLabel}
      </button>
      <p className="tab-help">{downloadStarted ? t.downloadNowStarted : t.downloadNowHelp}</p>

      <SettingsGroup title={t.keepWeekGroup}>
        <SettingRow label={t.autoDownloadEnabledLabel} help={t.autoDownloadEnabledHelp} onClick={() => setSettings({ ...settings, autoDownloadEnabled: !settings.autoDownloadEnabled })}>
          <Toggle checked={settings.autoDownloadEnabled} label={t.autoDownloadEnabledLabel} decorative />
        </SettingRow>
        {settings.autoDownloadEnabled && (
          <SettingRow label={t.wifiOnlyLabel} onClick={() => setSettings({ ...settings, wifiOnly: !settings.wifiOnly })}>
            <Toggle checked={settings.wifiOnly} label={t.wifiOnlyLabel} decorative />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t.whatToKeepGroup} help={t.presetHelp}>
        <SettingRow stack>
          <Segmented options={presetOptions} value={showCustom ? 'custom' : preset} onChange={choosePreset} label={t.whatToKeepGroup} />
        </SettingRow>
        {showCustom && (
          <>
            <SettingRow label={t.audioTypeLabel} onClick={() => toggleSection('audio')}>
              <Toggle checked={settings.contentTypes.audio} label={t.audioTypeLabel} decorative />
            </SettingRow>
            {HANACHA_EDITIONS.map((edition) => {
              const label = edition === 'sichosKodesh' ? t.sichosKodeshEditionLabel : t.torasMenachemEditionLabel;
              return (
                <SettingRow key={edition} label={label} onClick={() => toggleEdition(edition)}>
                  <Toggle checked={settings.contentTypes.hanachaEditions.includes(edition)} label={label} decorative />
                </SettingRow>
              );
            })}
            {(['mugah', 'maamorim', 'hagahos', 'hosofos'] as const).map((section) => (
              <SettingRow key={section} label={t.sectionLabels[section]} onClick={() => toggleSection(section)}>
                <Toggle checked={settings.contentTypes[section]} label={t.sectionLabels[section]} decorative />
              </SettingRow>
            ))}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title={t.whichYearGroup} help={settings.sourceYearMode === 'auto' ? t.sourceYearAutoHelp : undefined}>
        <SettingRow stack>
          <Segmented options={yearModeOptions} value={settings.sourceYearMode} onChange={chooseSourceYearMode} label={t.whichYearGroup} />
        </SettingRow>
        {settings.sourceYearMode === 'manual' && (
          <SettingRow label={t.sourceYearManualLabel} stack>
            <Chips
              options={allYears.map((year) => ({ value: year, label: hebrewYearLabel(year, language) }))}
              selected={settings.manualSourceYears}
              onToggle={toggleManualYear}
              label={t.sourceYearManualLabel}
            />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t.advancedGroup}>
        <SettingRow label={showAdvanced ? t.hideAdvancedLabel : t.showAdvancedLabel} onClick={() => setShowAdvanced((v) => !v)}>
          <Toggle checked={showAdvanced} label={t.showAdvancedLabel} decorative />
        </SettingRow>
        {showAdvanced && (
          <>
            <SettingRow label={t.downloadScopeLabel} stack>
              <Segmented options={scopeOptions} value={settings.scope} onChange={(scope) => setSettings({ ...settings, scope })} label={t.downloadScopeLabel} />
            </SettingRow>
            {settings.scope === 'week' && (
              <SettingRow label={t.kviusFallbackLabel} help={t.kviusFallbackHelp} onClick={() => setSettings({ ...settings, useKviusFallback: !settings.useKviusFallback })}>
                <Toggle checked={settings.useKviusFallback} label={t.kviusFallbackLabel} decorative />
              </SettingRow>
            )}
            <SettingRow label={t.manualDownloadAllContentLabel} help={t.manualDownloadAllContentHelp} onClick={() => setSettings({ ...settings, manualDownloadAllContent: !settings.manualDownloadAllContent })}>
              <Toggle checked={settings.manualDownloadAllContent} label={t.manualDownloadAllContentLabel} decorative />
            </SettingRow>
            <SettingRow label={t.retentionLabel} help={t.retentionHelp} stack>
              <Segmented options={retentionOptions} value={settings.retentionPeriod} onChange={(retentionPeriod) => setSettings({ ...settings, retentionPeriod })} label={t.retentionLabel} />
            </SettingRow>
            {settings.retentionPeriod !== 'never' && (
              <SettingRow label={t.keepFinishedContentLabel} onClick={() => setSettings({ ...settings, keepFinishedContent: !settings.keepFinishedContent })}>
                <Toggle checked={settings.keepFinishedContent} label={t.keepFinishedContentLabel} decorative />
              </SettingRow>
            )}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title={t.storageSection}>
        <SettingRow label={t.viewDownloadedLabel} value={usage != null ? t.storageUsageLabel(formatBytes(usage)) : undefined} to="/downloaded" />
        {confirmingClear ? (
          <SettingRow label={t.clearDownloadsLabel} help={t.clearDownloadsConfirm} stack danger>
            <div className="settings-actions">
              <button type="button" className="button button-danger" onClick={() => void clearDownloads()}>
                {t.confirmDeleteLabel}
              </button>
              <button type="button" className="button button-secondary" onClick={() => setConfirmingClear(false)}>
                {t.cancelLabel}
              </button>
            </div>
          </SettingRow>
        ) : (
          <SettingRow label={t.clearDownloadsLabel} onClick={() => setConfirmingClear(true)} danger />
        )}
      </SettingsGroup>
    </div>
  );
}
