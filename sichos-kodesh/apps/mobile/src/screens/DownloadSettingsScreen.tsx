import React, { useEffect, useState } from 'react';
import { browsableYears, currentHebrewYear } from '@sichos-kodesh/catalog';
import type { PdfEdition } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { PDF_SECTION_ORDER } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { isBackgroundSyncAvailable, runBackgroundSyncNow } from '../background/backgroundNative';
import { useDownload } from '../download/useDownload';
import { getDownloadStorageUsage } from '../download/downloadStorage';
import type { DownloadScope, RetentionPeriod, SourceYearMode } from '../download/downloadSettings';
import { useTranslation } from '../i18n/useTranslation';
import type { DownloadSettingsScreenProps } from '../navigation/types';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { Row } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { CategoryHeader, TabHelp } from '../ui/Typography';
import { OptionCheck } from './SettingsScreen';

const ALL_ENTRIES = Object.values(catalog).flat();
const HANACHA_EDITIONS: PdfEdition[] = ['sichosKodesh', 'torasMenachem'];
/** PDF_SECTION_ORDER minus biltiMugah (the highlighted hanacha, handled separately above) and mugah (its own toggle, ordered right after the hanacha editions). */
const OTHER_SECTIONS = PDF_SECTION_ORDER.filter((s): s is 'maamorim' | 'hagahos' | 'hosofos' => s !== 'biltiMugah' && s !== 'mugah');
const RETENTION_PERIODS: RetentionPeriod[] = ['never', '2w', '4w', '8w', '12w'];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Download settings (web: `/settings/downloads`). */
export function DownloadSettingsScreen(_: DownloadSettingsScreenProps) {
  const { t, language } = useTranslation();
  const { settings, setSettings, clearDownloads } = useDownload();
  const [usage, setUsage] = useState<number | null>(null);
  const [syncStarted, setSyncStarted] = useState(false);
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

  function toggleManualYear(year: number): void {
    const enabled = settings.manualSourceYears.includes(year);
    const manualSourceYears = enabled ? settings.manualSourceYears.filter((y) => y !== year) : [...settings.manualSourceYears, year].sort((a, b) => a - b);
    setSettings({ ...settings, manualSourceYears });
  }

  function toggleEdition(edition: PdfEdition): void {
    const enabled = settings.contentTypes.hanachaEditions.includes(edition);
    const hanachaEditions = enabled ? settings.contentTypes.hanachaEditions.filter((e) => e !== edition) : [...settings.contentTypes.hanachaEditions, edition];
    setSettings({ ...settings, contentTypes: { ...settings.contentTypes, hanachaEditions } });
  }

  function toggleSection(section: 'mugah' | 'maamorim' | 'hagahos' | 'hosofos'): void {
    setSettings({ ...settings, contentTypes: { ...settings.contentTypes, [section]: !settings.contentTypes[section] } });
  }

  async function handleClearDownloads(): Promise<void> {
    await clearDownloads();
    setUsage(await getDownloadStorageUsage(ALL_ENTRIES).catch(() => 0));
  }

  return (
    <Screen header={<ScreenHeader back={{ name: 'Settings', params: undefined }} title={t.downloadSettingsTitle} />}>
      <CategoryHeader first>{t.autoDownloadSection}</CategoryHeader>
      <Row
        label={t.autoDownloadEnabledLabel}
        marquee selected={settings.autoDownloadEnabled}
        trailing={<OptionCheck checked={settings.autoDownloadEnabled} />}
        onPress={() => setSettings({ ...settings, autoDownloadEnabled: !settings.autoDownloadEnabled })}
      />

      {settings.autoDownloadEnabled && backgroundAvailable && (
        <>
          <Row
            label={t.backgroundSyncLabel}
            marquee
            selected={settings.backgroundSyncEnabled}
            trailing={<OptionCheck checked={settings.backgroundSyncEnabled} />}
            onPress={() => setSettings({ ...settings, backgroundSyncEnabled: !settings.backgroundSyncEnabled })}
          />
          <TabHelp>{t.backgroundSyncHelp}</TabHelp>
        </>
      )}

      {settings.autoDownloadEnabled && (
        <>
          {(['week', 'month'] as DownloadScope[]).map((scope) => (
            <Row
              key={scope}
              label={scope === 'week' ? t.downloadScopeWeek : t.downloadScopeMonth}
              marquee selected={settings.scope === scope}
              trailing={<OptionCheck checked={settings.scope === scope} />}
              onPress={() => setSettings({ ...settings, scope })}
            />
          ))}

          <Row label={t.wifiOnlyLabel} marquee selected={settings.wifiOnly} trailing={<OptionCheck checked={settings.wifiOnly} />} onPress={() => setSettings({ ...settings, wifiOnly: !settings.wifiOnly })} />

          <CategoryHeader>{t.sourceYearSection}</CategoryHeader>
          {(['auto', 'manual'] as SourceYearMode[]).map((mode) => (
            <Row
              key={mode}
              label={mode === 'auto' ? t.sourceYearAutoLabel : t.sourceYearManualLabel}
              marquee selected={settings.sourceYearMode === mode}
              trailing={<OptionCheck checked={settings.sourceYearMode === mode} />}
              onPress={() =>
                setSettings({
                  ...settings,
                  sourceYearMode: mode,
                  manualSourceYears: mode === 'manual' && settings.manualSourceYears.length === 0 && matchedYears[0] != null ? [matchedYears[0]] : settings.manualSourceYears,
                })
              }
            />
          ))}

          {settings.sourceYearMode === 'manual' &&
            allYears.map((year) => (
              <Row
                key={year}
                label={hebrewYearLabel(year, language)}
                marquee selected={settings.manualSourceYears.includes(year)}
                trailing={<OptionCheck checked={settings.manualSourceYears.includes(year)} />}
                onPress={() => toggleManualYear(year)}
              />
            ))}

          {settings.scope === 'week' && (
            <Row
              label={t.kviusFallbackLabel}
              marquee selected={settings.useKviusFallback}
              trailing={<OptionCheck checked={settings.useKviusFallback} />}
              onPress={() => setSettings({ ...settings, useKviusFallback: !settings.useKviusFallback })}
            />
          )}
        </>
      )}

      {backgroundAvailable && (
        <>
          <Row
            label={t.syncNowLabel}
            marquee
            onPress={() => {
              runBackgroundSyncNow();
              setSyncStarted(true);
            }}
          />
          <TabHelp>{syncStarted ? t.syncNowStarted : t.syncNowHelp}</TabHelp>
        </>
      )}

      <CategoryHeader>{t.contentTypesSection}</CategoryHeader>
      <Row
        label={t.manualDownloadAllContentLabel}
        marquee selected={settings.manualDownloadAllContent}
        trailing={<OptionCheck checked={settings.manualDownloadAllContent} />}
        onPress={() => setSettings({ ...settings, manualDownloadAllContent: !settings.manualDownloadAllContent })}
      />
      <TabHelp>{t.manualDownloadAllContentHelp}</TabHelp>
      <Row
        label={t.audioTypeLabel}
        marquee selected={settings.contentTypes.audio}
        trailing={<OptionCheck checked={settings.contentTypes.audio} />}
        onPress={() => setSettings({ ...settings, contentTypes: { ...settings.contentTypes, audio: !settings.contentTypes.audio } })}
      />
      {HANACHA_EDITIONS.map((edition) => (
        <Row
          key={edition}
          label={edition === 'sichosKodesh' ? t.sichosKodeshEditionLabel : t.torasMenachemEditionLabel}
          marquee selected={settings.contentTypes.hanachaEditions.includes(edition)}
          trailing={<OptionCheck checked={settings.contentTypes.hanachaEditions.includes(edition)} />}
          onPress={() => toggleEdition(edition)}
        />
      ))}
      <Row label={t.sectionLabels.mugah} marquee selected={settings.contentTypes.mugah} trailing={<OptionCheck checked={settings.contentTypes.mugah} />} onPress={() => toggleSection('mugah')} />
      {OTHER_SECTIONS.map((section) => (
        <Row key={section} label={t.sectionLabels[section]} marquee selected={settings.contentTypes[section]} trailing={<OptionCheck checked={settings.contentTypes[section]} />} onPress={() => toggleSection(section)} />
      ))}

      <CategoryHeader>{t.retentionSection}</CategoryHeader>
      <TabHelp>{t.retentionHelp}</TabHelp>
      {RETENTION_PERIODS.map((period) => (
        <Row
          key={period}
          label={period === 'never' ? t.retentionNeverLabel : t.retentionAfterWeeksLabel(Number(period.slice(0, -1)))}
          marquee selected={settings.retentionPeriod === period}
          trailing={<OptionCheck checked={settings.retentionPeriod === period} />}
          onPress={() => setSettings({ ...settings, retentionPeriod: period })}
        />
      ))}

      {settings.retentionPeriod !== 'never' && (
        <Row
          label={t.keepFinishedContentLabel}
          marquee selected={settings.keepFinishedContent}
          trailing={<OptionCheck checked={settings.keepFinishedContent} />}
          onPress={() => setSettings({ ...settings, keepFinishedContent: !settings.keepFinishedContent })}
        />
      )}

      <CategoryHeader>{t.storageSection}</CategoryHeader>
      <TabHelp>{usage != null ? t.storageUsageLabel(formatBytes(usage)) : ''}</TabHelp>
      <Row
        label={t.clearDownloadsLabel}
        marquee
        onPress={() => {
          handleClearDownloads().catch(() => undefined);
        }}
      />
    </Screen>
  );
}
