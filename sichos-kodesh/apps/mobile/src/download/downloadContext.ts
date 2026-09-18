import { createContext } from 'react';
import type { CatalogAudio, CatalogEntry, CatalogPdf } from '@sichos-kodesh/catalog';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import type { DownloadSettings } from './downloadSettings';
import type { DownloadedOccasionSummary, StoredDownloadRecord, TargetDownloadState } from './downloadStorage';

export interface DownloadContextValue {
  settings: DownloadSettings;
  setSettings: (next: DownloadSettings) => void;
  hydrated: boolean;
  targetStates: Record<string, TargetDownloadState>;
  downloadedRecords: StoredDownloadRecord[];
  downloadOccasion: (entry: CatalogEntry) => Promise<void>;
  downloadAudio: (entry: CatalogEntry, audio: CatalogAudio, chapterIndex: number) => Promise<void>;
  downloadPdf: (entry: CatalogEntry, pdf: CatalogPdf) => Promise<void>;
  enqueueTargets: (targets: DownloadTarget[]) => Promise<void>;
  refreshDownloads: () => Promise<void>;
  deleteOccasionDownloads: (entry: CatalogEntry) => Promise<void>;
  clearDownloads: () => Promise<void>;
  getOccasionTargets: (entry: CatalogEntry, mode?: 'manual' | 'settings' | 'all') => DownloadTarget[];
  listDownloadedSummaries: () => Promise<DownloadedOccasionSummary[]>;
}

export const DownloadContext = createContext<DownloadContextValue | null>(null);
