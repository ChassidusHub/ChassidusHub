import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadContentTypes } from '@chassidushub-reader/app-core';
import type { LibraryAutoSettings } from '../library/libraryAutoDownload';

export type DownloadScope = 'week' | 'month';
export type SourceYearMode = 'auto' | 'manual';
/** How long an auto-downloaded file survives after it's no longer relevant to a sync run before pruneAutoDownloads.ts deletes it - 'never' keeps everything. */
export type RetentionPeriod = 'never' | '2w' | '4w' | '8w' | '12w';

/**
 * Same fields and semantics as apps/web/src/settings/useDownloadSettings.ts
 * (see that file's own comments for each one), with one deliberate
 * difference in the defaults: `autoDownloadEnabled` starts *on* here. A
 * phone is where this app is used away from a connection, and the
 * download is Wi-Fi-only by default, so a fresh install keeps the current
 * week ready without anyone touching a setting. On the phone that one
 * switch covers both moments the sync can run - on open, and every few
 * hours while the app is closed (see src/background); there is no
 * separate "also when closed" question. The web keeps it opt-in and has
 * no background at all.
 */
export interface DownloadSettings {
  autoDownloadEnabled: boolean;
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
  /** Phone only: which library collections the automatic sync also keeps ready (src/library/libraryAutoDownload.ts). All off until chosen. */
  libraryAutoDownload: LibraryAutoSettings;
}

const STORAGE_KEY = 'chassidushub:mobile-download-settings';

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  autoDownloadEnabled: true,
  scope: 'week',
  sourceYearMode: 'auto',
  manualSourceYears: [],
  useKviusFallback: true,
  wifiOnly: true,
  retentionPeriod: 'never',
  keepFinishedContent: true,
  manualDownloadAllContent: true,
  libraryAutoDownload: {},
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

/** Merged over the default rather than trusted as-is, so a settings shape saved by an older version of this app (a field added since) still comes back complete. A field an older version saved that no longer exists (`backgroundSyncEnabled`, 1.1.0) is dropped rather than carried along. */
function normalizeSettings(value: unknown): DownloadSettings {
  if (!value || typeof value !== 'object') return DEFAULT_DOWNLOAD_SETTINGS;
  const parsed = { ...(value as Partial<DownloadSettings> & { contentTypes?: Partial<DownloadContentTypes>; backgroundSyncEnabled?: unknown }) };
  delete parsed.backgroundSyncEnabled;
  return {
    ...DEFAULT_DOWNLOAD_SETTINGS,
    ...parsed,
    scope: parsed.scope === 'month' ? 'month' : 'week',
    sourceYearMode: parsed.sourceYearMode === 'manual' ? 'manual' : 'auto',
    manualSourceYears: Array.isArray(parsed.manualSourceYears) ? parsed.manualSourceYears.filter((year): year is number => typeof year === 'number' && Number.isFinite(year)) : [],
    retentionPeriod: RETENTION_PERIODS.includes(parsed.retentionPeriod as RetentionPeriod) ? (parsed.retentionPeriod as RetentionPeriod) : 'never',
    libraryAutoDownload:
      parsed.libraryAutoDownload && typeof parsed.libraryAutoDownload === 'object'
        ? Object.fromEntries(Object.entries(parsed.libraryAutoDownload).filter(([, enabled]) => typeof enabled === 'boolean'))
        : {},
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
