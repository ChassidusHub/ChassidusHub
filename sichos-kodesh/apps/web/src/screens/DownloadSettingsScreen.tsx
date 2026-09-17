import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { browsableYears, currentHebrewYear } from '@sichos-kodesh/catalog';
import type { PdfEdition } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { PDF_SECTION_ORDER } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OverflowMarquee } from '../components/OverflowMarquee';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDownload } from '../download/useDownload';
import { MEDIA_CACHE_NAME } from '../download/cacheName';
import { getDownloadedBytes } from '../download/downloadManager';
import { clearAutoDownloadLedger } from '../download/downloadLedger';
import { clearPendingChapterDownloads } from '../download/pendingDownloads';
import { clearPendingEntryDownloads } from '../download/pendingEntryDownloads';
import type { DownloadScope, RetentionPeriod, SourceYearMode } from '../settings/useDownloadSettings';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

const HANACHA_EDITIONS: PdfEdition[] = ['sichosKodesh', 'torasMenachem'];
/** PDF_SECTION_ORDER minus biltiMugah (the highlighted hanacha, handled separately above) and mugah (its own toggle, ordered right after the hanacha editions rather than grouped with hagahos/hosofos). */
const OTHER_SECTIONS = PDF_SECTION_ORDER.filter((s): s is 'maamorim' | 'hagahos' | 'hosofos' => s !== 'biltiMugah' && s !== 'mugah');
const RETENTION_PERIODS: RetentionPeriod[] = ['never', '2w', '4w', '8w', '12w'];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The week-scope kvius fallback here uses the same source-year preference as `resolveWeekWithFallback`. */
export function DownloadSettingsScreen() {
  const { t, language } = useTranslation();
  const { settings, setSettings } = useDownload();
  const [usage, setUsage] = useState<number | null>(null);

  useEffect(() => {
    void getDownloadedBytes()
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
    const hanachaEditions = enabled
      ? settings.contentTypes.hanachaEditions.filter((e) => e !== edition)
      : [...settings.contentTypes.hanachaEditions, edition];
    setSettings({ ...settings, contentTypes: { ...settings.contentTypes, hanachaEditions } });
  }

  function toggleSection(section: 'mugah' | 'maamorim' | 'hagahos' | 'hosofos'): void {
    setSettings({ ...settings, contentTypes: { ...settings.contentTypes, [section]: !settings.contentTypes[section] } });
  }

  async function clearDownloads(): Promise<void> {
    await caches.delete(MEDIA_CACHE_NAME);
    clearAutoDownloadLedger();
    // Without these, a download that happened to still be pending at the
    // exact moment of clearing would silently come back on the next app
    // open (see pendingDownloads.ts/pendingEntryDownloads.ts).
    clearPendingChapterDownloads();
    clearPendingEntryDownloads();
    setUsage(await getDownloadedBytes().catch(() => 0));
  }

  return (
    <div className="screen">
      <ScreenHeader to="/settings" title={t.downloadSettingsTitle} />

      <p className="category-header">{t.autoDownloadSection}</p>
      <ul className="year-list">
        <li className="settings-option-item">
          <button
            className={settings.autoDownloadEnabled ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
            onClick={() => setSettings({ ...settings, autoDownloadEnabled: !settings.autoDownloadEnabled })}
          >
            <OverflowMarquee className="year-row-year settings-option-label" text={t.autoDownloadEnabledLabel} />
            <span className="settings-option-end-slot">{settings.autoDownloadEnabled && <Check size={18} className="year-row-distance" />}</span>
          </button>
        </li>
      </ul>

      {settings.autoDownloadEnabled && (
        <>
          <ul className="year-list">
            {(['week', 'month'] as DownloadScope[]).map((scope) => (
              <li key={scope} className="settings-option-item">
                <button
                  className={settings.scope === scope ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
                  onClick={() => setSettings({ ...settings, scope })}
                >
                  <OverflowMarquee className="year-row-year settings-option-label" text={scope === 'week' ? t.downloadScopeWeek : t.downloadScopeMonth} />
                  <span className="settings-option-end-slot">{settings.scope === scope && <Check size={18} className="year-row-distance" />}</span>
                </button>
              </li>
            ))}
          </ul>

          <ul className="year-list">
            <li className="settings-option-item">
              <button
                className={settings.wifiOnly ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
                onClick={() => setSettings({ ...settings, wifiOnly: !settings.wifiOnly })}
              >
                <OverflowMarquee className="year-row-year settings-option-label" text={t.wifiOnlyLabel} />
                <span className="settings-option-end-slot">{settings.wifiOnly && <Check size={18} className="year-row-distance" />}</span>
              </button>
            </li>
          </ul>

          <p className="category-header">{t.sourceYearSection}</p>
          <ul className="year-list">
            {(['auto', 'manual'] as SourceYearMode[]).map((mode) => (
              <li key={mode} className="settings-option-item">
                <button
                  className={settings.sourceYearMode === mode ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      sourceYearMode: mode,
                      manualSourceYears: mode === 'manual' && settings.manualSourceYears.length === 0 && matchedYears[0] != null ? [matchedYears[0]] : settings.manualSourceYears,
                    })
                  }
                >
                  <OverflowMarquee className="year-row-year settings-option-label" text={mode === 'auto' ? t.sourceYearAutoLabel : t.sourceYearManualLabel} />
                  <span className="settings-option-end-slot">{settings.sourceYearMode === mode && <Check size={18} className="year-row-distance" />}</span>
                </button>
              </li>
            ))}
          </ul>

          {settings.sourceYearMode === 'manual' && (
            <ul className="year-list">
              {allYears.map((year) => (
                <li key={year} className="settings-option-item">
                  <button
                    className={settings.manualSourceYears.includes(year) ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
                    onClick={() => toggleManualYear(year)}
                  >
                    <OverflowMarquee className="year-row-year settings-option-label" text={hebrewYearLabel(year, language)} />
                    <span className="settings-option-end-slot">
                      {settings.manualSourceYears.includes(year) && <Check size={18} className="year-row-distance" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {settings.scope === 'week' && (
            <ul className="year-list">
              <li className="settings-option-item">
                <button
                  className={settings.useKviusFallback ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
                  onClick={() => setSettings({ ...settings, useKviusFallback: !settings.useKviusFallback })}
                >
                  <OverflowMarquee className="year-row-year settings-option-label" text={t.kviusFallbackLabel} />
                  <span className="settings-option-end-slot">{settings.useKviusFallback && <Check size={18} className="year-row-distance" />}</span>
                </button>
              </li>
            </ul>
          )}
        </>
      )}

      <p className="category-header">{t.contentTypesSection}</p>
      <ul className="year-list">
        <li className="settings-option-item">
          <button
            className={settings.manualDownloadAllContent ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
            onClick={() => setSettings({ ...settings, manualDownloadAllContent: !settings.manualDownloadAllContent })}
          >
            <OverflowMarquee className="year-row-year settings-option-label" text={t.manualDownloadAllContentLabel} />
            <span className="settings-option-end-slot">{settings.manualDownloadAllContent && <Check size={18} className="year-row-distance" />}</span>
          </button>
        </li>
      </ul>
      <p className="tab-help">{t.manualDownloadAllContentHelp}</p>
      <ul className="year-list">
        <li className="settings-option-item">
          <button
            className={settings.contentTypes.audio ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
            onClick={() => setSettings({ ...settings, contentTypes: { ...settings.contentTypes, audio: !settings.contentTypes.audio } })}
          >
            <OverflowMarquee className="year-row-year settings-option-label" text={t.audioTypeLabel} />
            <span className="settings-option-end-slot">{settings.contentTypes.audio && <Check size={18} className="year-row-distance" />}</span>
          </button>
        </li>
        {HANACHA_EDITIONS.map((edition) => (
          <li key={edition} className="settings-option-item">
            <button
              className={settings.contentTypes.hanachaEditions.includes(edition) ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
              onClick={() => toggleEdition(edition)}
            >
              <OverflowMarquee
                className="year-row-year settings-option-label"
                text={edition === 'sichosKodesh' ? t.sichosKodeshEditionLabel : t.torasMenachemEditionLabel}
              />
              <span className="settings-option-end-slot">
                {settings.contentTypes.hanachaEditions.includes(edition) && <Check size={18} className="year-row-distance" />}
              </span>
            </button>
          </li>
        ))}
        <li className="settings-option-item">
          <button
            className={settings.contentTypes.mugah ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
            onClick={() => toggleSection('mugah')}
          >
            <OverflowMarquee className="year-row-year settings-option-label" text={t.sectionLabels.mugah} />
            <span className="settings-option-end-slot">{settings.contentTypes.mugah && <Check size={18} className="year-row-distance" />}</span>
          </button>
        </li>
        {OTHER_SECTIONS.map((section) => (
          <li key={section} className="settings-option-item">
            <button
              className={settings.contentTypes[section] ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
              onClick={() => toggleSection(section)}
            >
              <OverflowMarquee className="year-row-year settings-option-label" text={t.sectionLabels[section]} />
              <span className="settings-option-end-slot">{settings.contentTypes[section] && <Check size={18} className="year-row-distance" />}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="category-header">{t.retentionSection}</p>
      <p className="tab-help">{t.retentionHelp}</p>
      <ul className="year-list">
        {RETENTION_PERIODS.map((period) => (
          <li key={period} className="settings-option-item">
            <button
              className={settings.retentionPeriod === period ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
              onClick={() => setSettings({ ...settings, retentionPeriod: period })}
            >
              <OverflowMarquee className="year-row-year settings-option-label" text={period === 'never' ? t.retentionNeverLabel : t.retentionAfterWeeksLabel(Number(period.slice(0, -1)))} />
              <span className="settings-option-end-slot">{settings.retentionPeriod === period && <Check size={18} className="year-row-distance" />}</span>
            </button>
          </li>
        ))}
      </ul>

      {settings.retentionPeriod !== 'never' && (
        <ul className="year-list">
          <li className="settings-option-item">
            <button
              className={settings.keepFinishedContent ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
              onClick={() => setSettings({ ...settings, keepFinishedContent: !settings.keepFinishedContent })}
            >
              <OverflowMarquee className="year-row-year settings-option-label" text={t.keepFinishedContentLabel} />
              <span className="settings-option-end-slot">{settings.keepFinishedContent && <Check size={18} className="year-row-distance" />}</span>
            </button>
          </li>
        </ul>
      )}

      <p className="category-header">{t.storageSection}</p>
      <p className="tab-help">{usage != null ? t.storageUsageLabel(formatBytes(usage)) : ''}</p>
      <ul className="year-list">
        <li className="settings-option-item">
          <button className="year-row settings-option-row" onClick={() => void clearDownloads()}>
            <OverflowMarquee className="year-row-year settings-option-label" text={t.clearDownloadsLabel} />
          </button>
        </li>
      </ul>
    </div>
  );
}
