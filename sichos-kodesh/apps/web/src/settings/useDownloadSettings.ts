import { useState } from 'react';
import type { DownloadContentTypes } from '../download/downloadManager';

export type DownloadScope = 'week' | 'month';
export type SourceYearMode = 'auto' | 'manual';

export interface DownloadSettings {
  autoDownloadEnabled: boolean;
  /** How far ahead sync-on-open pre-fetches. */
  scope: DownloadScope;
  sourceYearMode: SourceYearMode;
  /**
   * Only meaningful when `sourceYearMode === 'manual'` - any catalog year,
   * not just a kvius match, and more than one at once: each selected year
   * is resolved independently (week or month, same as 'auto' mode would
   * for a single year) and the results unioned, so picking several years
   * downloads that many years' worth of content for the same week/month
   * rather than picking one "winner" among them. Empty is treated the same
   * as 'auto' mode until at least one year is actually picked.
   */
  manualSourceYears: number[];
  /** Week scope only - see `resolveWeekWithFallback` in packages/catalog. A month download always just shows whatever's indexed for that month, no substitution. Applies per selected year, same as it would for a single auto-picked year. */
  useKviusFallback: boolean;
  wifiOnly: boolean;
  contentTypes: DownloadContentTypes;
}

const STORAGE_KEY = 'sichos-kodesh:download-settings';

/**
 * Off by default (a real behavior/data-usage change shouldn't turn itself
 * on), week-scoped, kvius fallback on (matches the same preference
 * `ThisWeekScreen`'s own suggestion already uses), and only the highlighted
 * hanacha + recordings enabled - mugah/maamorim/hagahos/hosofos are real
 * but secondary content (see FarbrengenScreen's "more" section), off until
 * the user actually wants them pre-fetched too.
 */
export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  autoDownloadEnabled: false,
  scope: 'week',
  sourceYearMode: 'auto',
  manualSourceYears: [],
  useKviusFallback: true,
  wifiOnly: true,
  contentTypes: {
    audio: true,
    hanachaEditions: ['sichosKodesh', 'torasMenachem'],
    mugah: false,
    maamorim: false,
    hagahos: false,
    hosofos: false,
  },
};

function readStored(): DownloadSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DOWNLOAD_SETTINGS;
    // Merged over the default rather than trusted as-is, so a settings
    // shape saved by an older version of this app (a field added since)
    // still comes back complete instead of missing keys later code assumes exist.
    // `manualSourceYear` (singular) is this setting's pre-multi-year shape -
    // migrated into the new array field so an existing saved pick survives
    // the upgrade instead of silently reverting to "auto."
    const parsed = JSON.parse(raw) as Partial<DownloadSettings> & { manualSourceYear?: number | null };
    const manualSourceYears = parsed.manualSourceYears ?? (parsed.manualSourceYear != null ? [parsed.manualSourceYear] : DEFAULT_DOWNLOAD_SETTINGS.manualSourceYears);
    return { ...DEFAULT_DOWNLOAD_SETTINGS, ...parsed, manualSourceYears, contentTypes: { ...DEFAULT_DOWNLOAD_SETTINGS.contentTypes, ...parsed.contentTypes } };
  } catch {
    return DEFAULT_DOWNLOAD_SETTINGS;
  }
}

export function useDownloadSettings(): [DownloadSettings, (next: DownloadSettings) => void] {
  const [settings, setSettingsState] = useState<DownloadSettings>(readStored);

  function setSettings(next: DownloadSettings): void {
    setSettingsState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort persistence only.
    }
  }

  return [settings, setSettings];
}
