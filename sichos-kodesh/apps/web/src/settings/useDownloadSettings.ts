import { useState } from 'react';
import type { DownloadContentTypes } from '../download/downloadManager';

export type DownloadScope = 'week' | 'month';
export type SourceYearMode = 'auto' | 'manual';

export interface DownloadSettings {
  autoDownloadEnabled: boolean;
  /** How far ahead sync-on-open pre-fetches. */
  scope: DownloadScope;
  sourceYearMode: SourceYearMode;
  /** Only meaningful when `sourceYearMode === 'manual'`. */
  manualSourceYear: number | null;
  /** Week scope only - see `resolveWeekWithFallback` in packages/catalog. A month download always just shows whatever's indexed for that month, no substitution. */
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
  manualSourceYear: null,
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
    const parsed = JSON.parse(raw) as Partial<DownloadSettings>;
    return { ...DEFAULT_DOWNLOAD_SETTINGS, ...parsed, contentTypes: { ...DEFAULT_DOWNLOAD_SETTINGS.contentTypes, ...parsed.contentTypes } };
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
