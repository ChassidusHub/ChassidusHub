import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { browsableYears, currentHebrewYear } from '@sichos-kodesh/catalog';
import type { PdfEdition } from '@sichos-kodesh/catalog';
import { contentPreset, presetContentTypes } from '@sichos-kodesh/app-core';
import type { ContentPreset } from '@sichos-kodesh/app-core';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import catalog from '../catalog/data';
import { isBackgroundSyncAvailable, runBackgroundSyncNow } from '../background/backgroundNative';
import { useDownload } from '../download/useDownload';
import { getDownloadStorageUsage } from '../download/downloadStorage';
import type { DownloadScope, RetentionPeriod, SourceYearMode } from '../download/downloadSettings';
import { resolveAutoDownloadEntries } from '../download/useAutoDownloadSync';
import { useTranslation } from '../i18n/useTranslation';
import type { DownloadSettingsScreenProps } from '../navigation/types';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { formatBytes } from '../utils/formatBytes';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Chips, Segmented, SettingRow, SettingsGroup, Toggle } from '../ui/settings/SettingsControls';
import { TabHelp } from '../ui/Typography';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';
import { presetLabel } from './SettingsScreen';

const ALL_ENTRIES = Object.values(catalog).flat();
const HANACHA_EDITIONS: PdfEdition[] = ['sichosKodesh', 'torasMenachem'];
const RETENTION_PERIODS: RetentionPeriod[] = ['never', '2w', '4w', '8w', '12w'];

/**
 * Offline & downloads (web: `/settings/downloads`): three plain questions
 * - keep this week ready? what to keep? which year? - each one control,
 * with the rarely-touched knobs (month scope, gap filling, cleanup, what a
 * manual download takes) behind an Advanced switch, and storage at the
 * bottom. The phone adds "also when the app is closed" (see
 * src/background) under the first switch.
 */
export function DownloadSettingsScreen({ navigation }: DownloadSettingsScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const { settings, setSettings, enqueueBulk, clearDownloads } = useDownload();
  const [usage, setUsage] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customChosen, setCustomChosen] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  // Phone only (see src/background): the web has no background at all.
  const backgroundAvailable = isBackgroundSyncAvailable();

  useEffect(() => {
    getDownloadStorageUsage(ALL_ENTRIES)
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

  /** The phone hands the run to the background worker (it survives leaving the app); anywhere else it is the in-app queue. */
  function downloadNow(): void {
    if (backgroundAvailable) {
      runBackgroundSyncNow();
    } else {
      const entries = resolveAutoDownloadEntries(settings, new Date());
      if (entries.length > 0) enqueueBulk(entries, 'manual').catch(() => undefined);
    }
    setDownloadStarted(true);
  }

  async function handleClearDownloads(): Promise<void> {
    await clearDownloads();
    setConfirmingClear(false);
    setUsage(await getDownloadStorageUsage(ALL_ENTRIES).catch(() => 0));
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
    <Screen header={<ScreenHeader back={{ name: 'Settings', params: undefined }} title={t.downloadSettingsTitle} />}>
      <Button label={t.downloadNowLabel} onPress={downloadNow} style={styles.downloadNow} />
      <TabHelp>{downloadStarted ? t.downloadNowStarted : t.downloadNowHelp}</TabHelp>

      <SettingsGroup title={t.keepWeekGroup} first>
        <SettingRow label={t.autoDownloadEnabledLabel} help={t.autoDownloadEnabledHelp} onPress={() => setSettings({ ...settings, autoDownloadEnabled: !settings.autoDownloadEnabled })} first>
          <Toggle checked={settings.autoDownloadEnabled} label={t.autoDownloadEnabledLabel} decorative />
        </SettingRow>
        {settings.autoDownloadEnabled && backgroundAvailable && (
          <SettingRow label={t.backgroundSyncLabel} help={t.backgroundSyncHelp} onPress={() => setSettings({ ...settings, backgroundSyncEnabled: !settings.backgroundSyncEnabled })}>
            <Toggle checked={settings.backgroundSyncEnabled} label={t.backgroundSyncLabel} decorative />
          </SettingRow>
        )}
        {settings.autoDownloadEnabled && (
          <SettingRow label={t.wifiOnlyLabel} onPress={() => setSettings({ ...settings, wifiOnly: !settings.wifiOnly })}>
            <Toggle checked={settings.wifiOnly} label={t.wifiOnlyLabel} decorative />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t.whatToKeepGroup} help={t.presetHelp}>
        <SettingRow stack first>
          <Segmented options={presetOptions} value={showCustom ? 'custom' : preset} onChange={choosePreset} label={t.whatToKeepGroup} />
        </SettingRow>
        {showCustom && (
          <>
            <SettingRow label={t.audioTypeLabel} onPress={() => toggleSection('audio')}>
              <Toggle checked={settings.contentTypes.audio} label={t.audioTypeLabel} decorative />
            </SettingRow>
            {HANACHA_EDITIONS.map((edition) => {
              const label = edition === 'sichosKodesh' ? t.sichosKodeshEditionLabel : t.torasMenachemEditionLabel;
              return (
                <SettingRow key={edition} label={label} onPress={() => toggleEdition(edition)}>
                  <Toggle checked={settings.contentTypes.hanachaEditions.includes(edition)} label={label} decorative />
                </SettingRow>
              );
            })}
            {(['mugah', 'maamorim', 'hagahos', 'hosofos'] as const).map((section) => (
              <SettingRow key={section} label={t.sectionLabels[section]} onPress={() => toggleSection(section)}>
                <Toggle checked={settings.contentTypes[section]} label={t.sectionLabels[section]} decorative />
              </SettingRow>
            ))}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title={t.whichYearGroup} help={settings.sourceYearMode === 'auto' ? t.sourceYearAutoHelp : undefined}>
        <SettingRow stack first>
          <Segmented options={yearModeOptions} value={settings.sourceYearMode} onChange={chooseSourceYearMode} label={t.whichYearGroup} />
        </SettingRow>
        {settings.sourceYearMode === 'manual' && (
          <SettingRow label={t.sourceYearManualLabel} stack>
            <Chips options={allYears.map((year) => ({ value: year, label: hebrewYearLabel(year, language) }))} selected={settings.manualSourceYears} onToggle={toggleManualYear} label={t.sourceYearManualLabel} />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t.advancedGroup}>
        <SettingRow label={showAdvanced ? t.hideAdvancedLabel : t.showAdvancedLabel} onPress={() => setShowAdvanced((v) => !v)} first>
          <Toggle checked={showAdvanced} label={t.showAdvancedLabel} decorative />
        </SettingRow>
        {showAdvanced && (
          <>
            <SettingRow label={t.downloadScopeLabel} stack>
              <Segmented options={scopeOptions} value={settings.scope} onChange={(scope) => setSettings({ ...settings, scope })} label={t.downloadScopeLabel} />
            </SettingRow>
            {settings.scope === 'week' && (
              <SettingRow label={t.kviusFallbackLabel} help={t.kviusFallbackHelp} onPress={() => setSettings({ ...settings, useKviusFallback: !settings.useKviusFallback })}>
                <Toggle checked={settings.useKviusFallback} label={t.kviusFallbackLabel} decorative />
              </SettingRow>
            )}
            <SettingRow label={t.manualDownloadAllContentLabel} help={t.manualDownloadAllContentHelp} onPress={() => setSettings({ ...settings, manualDownloadAllContent: !settings.manualDownloadAllContent })}>
              <Toggle checked={settings.manualDownloadAllContent} label={t.manualDownloadAllContentLabel} decorative />
            </SettingRow>
            <SettingRow label={t.retentionLabel} help={t.retentionHelp} stack>
              <Segmented options={retentionOptions} value={settings.retentionPeriod} onChange={(retentionPeriod) => setSettings({ ...settings, retentionPeriod })} label={t.retentionLabel} />
            </SettingRow>
            {settings.retentionPeriod !== 'never' && (
              <SettingRow label={t.keepFinishedContentLabel} onPress={() => setSettings({ ...settings, keepFinishedContent: !settings.keepFinishedContent })}>
                <Toggle checked={settings.keepFinishedContent} label={t.keepFinishedContentLabel} decorative />
              </SettingRow>
            )}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title={t.storageSection}>
        <SettingRow label={t.viewDownloadedLabel} value={usage != null ? t.storageUsageLabel(formatBytes(usage)) : undefined} chevron onPress={() => navigation.navigate('Downloaded')} first />
        {confirmingClear ? (
          <SettingRow label={t.clearDownloadsLabel} help={t.clearDownloadsConfirm} stack danger>
            <View style={[styles.actions, { flexDirection: row(isRtl) }]}>
              <Button
                label={t.confirmDeleteLabel}
                style={[styles.action, { backgroundColor: colors.danger }]}
                onPress={() => {
                  handleClearDownloads().catch(() => undefined);
                }}
              />
              <Button label={t.cancelLabel} style={[styles.action, styles.actionSecondary, { backgroundColor: colors.bg, borderColor: colors.border }]} onPress={() => setConfirmingClear(false)} />
            </View>
          </SettingRow>
        ) : (
          <SettingRow label={t.clearDownloadsLabel} onPress={() => setConfirmingClear(true)} danger />
        )}
      </SettingsGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  downloadNow: { marginTop: 0, marginBottom: 12 },
  /** Web: `.settings-actions` - the two confirm buttons side by side, no outer margins. */
  actions: { gap: 8, paddingTop: 4, paddingBottom: 12 },
  action: { flex: 1, width: undefined, marginTop: 0, marginBottom: 0 },
  /** Web: `.button-secondary` - outlined, on the page background. */
  actionSecondary: { borderWidth: 1 },
});
