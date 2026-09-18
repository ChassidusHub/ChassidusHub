import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadContentTypes } from '@sichos-kodesh/app-core';

export interface DownloadSettings {
  autoDownloadEnabled: boolean;
  wifiOnly: boolean;
  manualDownloadAllContent: boolean;
  contentTypes: DownloadContentTypes;
}

const STORAGE_KEY = 'sichos-kodesh:mobile-download-settings';

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  autoDownloadEnabled: false,
  wifiOnly: true,
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

function normalizeSettings(value: unknown): DownloadSettings {
  if (!value || typeof value !== 'object') return DEFAULT_DOWNLOAD_SETTINGS;
  const parsed = value as Partial<DownloadSettings> & { contentTypes?: Partial<DownloadContentTypes> };
  return {
    ...DEFAULT_DOWNLOAD_SETTINGS,
    ...parsed,
    contentTypes: {
      ...DEFAULT_DOWNLOAD_SETTINGS.contentTypes,
      ...parsed.contentTypes,
      hanachaEditions: Array.isArray(parsed.contentTypes?.hanachaEditions)
        ? parsed.contentTypes.hanachaEditions.filter(
            (edition): edition is DownloadContentTypes['hanachaEditions'][number] =>
              edition === 'sichosKodesh' || edition === 'sefer' || edition === 'torasMenachem',
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
