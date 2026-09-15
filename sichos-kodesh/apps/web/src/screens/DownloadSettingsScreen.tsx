import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { currentHebrewYear } from '@sichos-kodesh/catalog';
import type { PdfEdition } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { PDF_SECTION_ORDER } from '@sichos-kodesh/catalog';
import { BackLink } from '../components/BackLink';
import { useDownload } from '../download/useDownload';
import { MEDIA_CACHE_NAME } from '../download/cacheName';
import type { DownloadScope, SourceYearMode } from '../settings/useDownloadSettings';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

const HANACHA_EDITIONS: PdfEdition[] = ['sichosKodesh', 'torasMenachem'];
/** The rest of PDF_SECTION_ORDER once mugah/biltiMugah are set aside - biltiMugah is the highlighted hanacha (handled separately, above), and mugah gets its own toggle in this same content-types list, ordered right after the hanacha editions rather than lumped with hagahos/hosofos. */
const OTHER_SECTIONS = PDF_SECTION_ORDER.filter((s): s is 'maamorim' | 'hagahos' | 'hosofos' => s !== 'biltiMugah' && s !== 'mugah');

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Every setting the download feature has: whether it runs automatically
 * (and how far ahead), which year it pulls from (and whether to fall back
 * to a nearby kvius match when that year has a gap - week scope only, the
 * same preference `resolveWeekWithFallback` already uses), which content
 * types count, and how much is actually on disk right now. Its own screen
 * rather than crammed into the flat SettingsScreen - this is the one
 * section with enough real options to need one.
 */
export function DownloadSettingsScreen() {
  const { t, language } = useTranslation();
  const { settings, setSettings } = useDownload();
  const [usage, setUsage] = useState<number | null>(null);

  useEffect(() => {
    void navigator.storage
      ?.estimate()
      .then((estimate) => setUsage(estimate.usage ?? 0))
      .catch(() => setUsage(null));
  }, [settings]); // Re-read after every settings change too, since "Clear downloads" itself is a settings-adjacent action below.

  const matchedYears = findMatchingYears(currentHebrewYear())
    .map((m) => m.hebrewYear)
    .sort((a, b) => a - b);

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
    const estimate = await navigator.storage?.estimate().catch(() => null);
    setUsage(estimate?.usage ?? 0);
  }

  return (
    <div className="screen">
      <BackLink to="/settings" />
      <h1>{t.downloadSettingsTitle}</h1>

      <p className="category-header">{t.autoDownloadSection}</p>
      <ul className="year-list">
        <li>
          <button
            className={settings.autoDownloadEnabled ? 'year-row year-row-selected' : 'year-row'}
            onClick={() => setSettings({ ...settings, autoDownloadEnabled: !settings.autoDownloadEnabled })}
          >
            <span className="year-row-year">{t.autoDownloadEnabledLabel}</span>
            {settings.autoDownloadEnabled && <Check size={18} className="year-row-distance" />}
          </button>
        </li>
      </ul>

      {settings.autoDownloadEnabled && (
        <>
          <ul className="year-list">
            {(['week', 'month'] as DownloadScope[]).map((scope) => (
              <li key={scope}>
                <button
                  className={settings.scope === scope ? 'year-row year-row-selected' : 'year-row'}
                  onClick={() => setSettings({ ...settings, scope })}
                >
                  <span className="year-row-year">{scope === 'week' ? t.downloadScopeWeek : t.downloadScopeMonth}</span>
                  {settings.scope === scope && <Check size={18} className="year-row-distance" />}
                </button>
              </li>
            ))}
          </ul>

          <ul className="year-list">
            <li>
              <button
                className={settings.wifiOnly ? 'year-row year-row-selected' : 'year-row'}
                onClick={() => setSettings({ ...settings, wifiOnly: !settings.wifiOnly })}
              >
                <span className="year-row-year">{t.wifiOnlyLabel}</span>
                {settings.wifiOnly && <Check size={18} className="year-row-distance" />}
              </button>
            </li>
          </ul>

          <p className="category-header">{t.sourceYearSection}</p>
          <ul className="year-list">
            {(['auto', 'manual'] as SourceYearMode[]).map((mode) => (
              <li key={mode}>
                <button
                  className={settings.sourceYearMode === mode ? 'year-row year-row-selected' : 'year-row'}
                  onClick={() => setSettings({ ...settings, sourceYearMode: mode, manualSourceYear: mode === 'manual' ? (settings.manualSourceYear ?? matchedYears[0] ?? null) : null })}
                >
                  <span className="year-row-year">{mode === 'auto' ? t.sourceYearAutoLabel : t.sourceYearManualLabel}</span>
                  {settings.sourceYearMode === mode && <Check size={18} className="year-row-distance" />}
                </button>
              </li>
            ))}
          </ul>

          {settings.sourceYearMode === 'manual' && (
            <ul className="year-list">
              {matchedYears.map((year) => (
                <li key={year}>
                  <button
                    className={settings.manualSourceYear === year ? 'year-row year-row-selected' : 'year-row'}
                    onClick={() => setSettings({ ...settings, manualSourceYear: year })}
                  >
                    <span className="year-row-year">{hebrewYearLabel(year, language)}</span>
                    {settings.manualSourceYear === year && <Check size={18} className="year-row-distance" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {settings.scope === 'week' && (
            <ul className="year-list">
              <li>
                <button
                  className={settings.useKviusFallback ? 'year-row year-row-selected' : 'year-row'}
                  onClick={() => setSettings({ ...settings, useKviusFallback: !settings.useKviusFallback })}
                >
                  <span className="year-row-year">{t.kviusFallbackLabel}</span>
                  {settings.useKviusFallback && <Check size={18} className="year-row-distance" />}
                </button>
              </li>
            </ul>
          )}
        </>
      )}

      <p className="category-header">{t.contentTypesSection}</p>
      <ul className="year-list">
        <li>
          <button
            className={settings.contentTypes.audio ? 'year-row year-row-selected' : 'year-row'}
            onClick={() => setSettings({ ...settings, contentTypes: { ...settings.contentTypes, audio: !settings.contentTypes.audio } })}
          >
            <span className="year-row-year">{t.audioTypeLabel}</span>
            {settings.contentTypes.audio && <Check size={18} className="year-row-distance" />}
          </button>
        </li>
        {HANACHA_EDITIONS.map((edition) => (
          <li key={edition}>
            <button
              className={settings.contentTypes.hanachaEditions.includes(edition) ? 'year-row year-row-selected' : 'year-row'}
              onClick={() => toggleEdition(edition)}
            >
              <span className="year-row-year">{edition === 'sichosKodesh' ? t.sichosKodeshEditionLabel : t.torasMenachemEditionLabel}</span>
              {settings.contentTypes.hanachaEditions.includes(edition) && <Check size={18} className="year-row-distance" />}
            </button>
          </li>
        ))}
        <li>
          <button
            className={settings.contentTypes.mugah ? 'year-row year-row-selected' : 'year-row'}
            onClick={() => toggleSection('mugah')}
          >
            <span className="year-row-year">{t.sectionLabels.mugah}</span>
            {settings.contentTypes.mugah && <Check size={18} className="year-row-distance" />}
          </button>
        </li>
        {OTHER_SECTIONS.map((section) => (
          <li key={section}>
            <button className={settings.contentTypes[section] ? 'year-row year-row-selected' : 'year-row'} onClick={() => toggleSection(section)}>
              <span className="year-row-year">{t.sectionLabels[section]}</span>
              {settings.contentTypes[section] && <Check size={18} className="year-row-distance" />}
            </button>
          </li>
        ))}
      </ul>

      <p className="category-header">{t.storageSection}</p>
      <p className="tab-help">{usage != null ? t.storageUsageLabel(formatBytes(usage)) : ''}</p>
      <ul className="year-list">
        <li>
          <button className="year-row" onClick={() => void clearDownloads()}>
            <span className="year-row-year">{t.clearDownloadsLabel}</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
