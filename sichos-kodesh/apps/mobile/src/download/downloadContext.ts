import { createContext } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import type { DownloadSettings } from './downloadSettings';
import type { DownloadedOccasionSummary, StoredDownloadRecord, TargetDownloadState } from './downloadStorage';

/**
 * What one occasion row (or chapter row) shows for its download slot.
 * `'unavailable'` (nothing downloadable, or offline with nothing cached) shows
 * no icon at all; `'loading'` is the brief window before the real
 * on-disk check resolves. Same vocabulary as the web's RowDownloadState.
 */
export type RowDownloadState = 'unavailable' | 'loading' | 'none' | 'queued' | 'downloading' | 'downloaded';

export type EnqueueMode = 'manual' | 'auto';

export interface DownloadContextValue {
  settings: DownloadSettings;
  setSettings: (next: DownloadSettings) => void;
  hydrated: boolean;
  /** Live per-file state for every download this session has touched, keyed by download-target key. */
  targetStates: Record<string, TargetDownloadState>;
  downloadedRecords: StoredDownloadRecord[];
  /** A row's own download tap - every content type when `manualDownloadAllContent` is on, otherwise the settings' content types. */
  downloadOccasion: (entry: CatalogEntry) => Promise<void>;
  /** "Download this week/month" and the auto-download sync - `mode: 'auto'` marks the files as auto-managed for retention. */
  enqueueBulk: (entries: CatalogEntry[], mode?: EnqueueMode) => Promise<void>;
  /** RecordingsScreen's per-chapter download icon - one recording, regardless of the content-type settings. */
  downloadChapter: (entry: CatalogEntry, chapterIndex: number) => Promise<void>;
  /** RecordingsScreen's header action - every recording of one occasion, unconditionally. */
  downloadAllChapters: (entry: CatalogEntry) => Promise<void>;
  enqueueTargets: (targets: DownloadTarget[], mode?: EnqueueMode) => Promise<void>;
  cancelDownload: (targetKey: string) => Promise<void>;
  refreshDownloads: () => Promise<void>;
  deleteOccasionDownloads: (entry: CatalogEntry) => Promise<void>;
  clearDownloads: () => Promise<void>;
  getOccasionTargets: (entry: CatalogEntry, mode?: 'manual' | 'settings' | 'all') => DownloadTarget[];
  listDownloadedSummaries: () => Promise<DownloadedOccasionSummary[]>;
}

export const DownloadContext = createContext<DownloadContextValue | null>(null);
