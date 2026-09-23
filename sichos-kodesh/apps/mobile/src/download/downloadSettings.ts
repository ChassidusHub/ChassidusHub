import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadContentTypes } from '@sichos-kodesh/app-core';

export type DownloadScope = 'week' | 'month';
export type SourceYearMode = 'auto' | 'manual';
/** How long an auto-downloaded file survives after it's no longer relevant to a sync run before pruneAutoDownloads.ts deletes it - 'never' keeps everything. */
export type RetentionPeriod = 'never' | '2w' | '4w' | '8w' | '12w';

/** Same fields, defaults and semantics as apps/web/src/settings/useDownloadSettings.ts - see that file's own comments for each one. */
export interface DownloadSettings {
  autoDownloadEnabled: boolean;
  /**
   * Phone only: also run the automatic sync periodically while the app is
   * closed (see src/background), not just on open. No web counterpart -
   * a web app has no reliable way to work in the background.
   */
  backgroundSyncEnabled: boolean;
  /** How far ahead sync-on-open pre-fetches. */
  scope: DownloadScope;
  sourceYearMode: SourceYearMode;
  /** Only meaningful when `sourceYearMode === 'manual'` - each selected year is resolved independently and the results unioned. Empty is treated the same as 'auto' until at least one year is picked. */
  manualSourceYears: number[];
  /** Week scope only - see `resolveWeekWithFallback` in packages/catalog. */
  useKviusFallback: boolean;
  wifiOnly: boolean;
  contentTypes: DownloadContentTypes;
  /** Auto-cleanup for auto-downloaded content only - see pruneAutoDownloads.ts. */
  retentionPeriod: RetentionPeriod;
  /** Also protects a *finished* occasion's auto-downloaded files past the retention window even if it was never re-opened after finishing. */
  keepFinishedContent: boolean;
  /** When true (the default), manual downloads fetch every available content type regardless of the `contentTypes` filter, which then only governs the automatic sync. */
  manualDownloadAllContent: boolean;
}

const STORAGE_KEY = 'sichos-kodesh:mobile-download-settings';

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  autoDownloadEnabled: false,
  backgroundSyncEnabled: true,
  scope: 'week',
  sourceYearMode: 'auto',
  manualSourceYears: [],
  useKviusFallback: true,
  wifiOnly: true,
  retentionPeriod: 'never',
  keepFinishedContent: true,
  manualDownloadAllContent: true,
  contentTypes: {
    audio: true,
    hanachaEditions: ['sichosKodesh', 'torasMenachem'],
    mugah: false,
    maamorim: false,
    hagahos: false,
    hosofos: false,
  },
};

const RETENTION_PERIODS: RetentionPeriod[] = ['never', '2w', '4w', '8w', '12w'];

/** Merged over the default rather than trusted as-is, so a settings shape saved by an older version of this app (a field added since) still comes back complete. */
function normalizeSettings(value: unknown): DownloadSettings {
  if (!value || typeof value !== 'object') return DEFAULT_DOWNLOAD_SETTINGS;
  const parsed = value as Partial<DownloadSettings> & { contentTypes?: Partial<DownloadContentTypes> };
  return {
    ...DEFAULT_DOWNLOAD_SETTINGS,
    ...parsed,
    backgroundSyncEnabled: typeof parsed.backgroundSyncEnabled === 'boolean' ? parsed.backgroundSyncEnabled : DEFAULT_DOWNLOAD_SETTINGS.backgroundSyncEnabled,
    scope: parsed.scope === 'month' ? 'month' : 'week',
    sourceYearMode: parsed.sourceYearMode === 'manual' ? 'manual' : 'auto',
    manualSourceYears: Array.isArray(parsed.manualSourceYears) ? parsed.manualSourceYears.filter((year): year is number => typeof year === 'number' && Number.isFinite(year)) : [],
    retentionPeriod: RETENTION_PERIODS.includes(parsed.retentionPeriod as RetentionPeriod) ? (parsed.retentionPeriod as RetentionPeriod) : 'never',
    contentTypes: {
      ...DEFAULT_DOWNLOAD_SETTINGS.contentTypes,
      ...parsed.contentTypes,
      hanachaEditions: Array.isArray(parsed.contentTypes?.hanachaEditions)
        ? parsed.contentTypes.hanachaEditions.filter(
            (edition): edition is DownloadContentTypes['hanachaEditions'][number] => edition === 'sichosKodesh' || edition === 'sefer' || edition === 'torasMenachem',
          )
        : DEFAULT_DOWNLOAD_SETTINGS.contentTypes.hanachaEditions,
    },
  };
}

export async function readStoredDownloadSettings(): Promise<DownloadSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_DOWNLOAD_SETTINGS;
  } catch {
    return DEFAULT_DOWNLOAD_SETTINGS;
  }
}

export async function writeStoredDownloadSettings(next: DownloadSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort persistence only.
  }
}

export function useDownloadSettings(): [DownloadSettings, (next: DownloadSettings) => void, boolean] {
  const [settings, setSettingsState] = useState<DownloadSettings>(DEFAULT_DOWNLOAD_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readStoredDownloadSettings().then((stored) => {
      if (!cancelled) {
        setSettingsState(stored);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setSettings(next: DownloadSettings): void {
    setSettingsState(next);
    writeStoredDownloadSettings(next).catch(() => undefined);
  }

  return [settings, setSettings, hydrated];
}
