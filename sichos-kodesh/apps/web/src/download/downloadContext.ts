import { createContext } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { DownloadSettings } from '../settings/useDownloadSettings';

/** `'unavailable'` - the current content-type settings select nothing at all for this occasion (e.g. only "Mugah" is enabled and this one has none) - is distinct from `'none'` ("downloadable, just not downloaded yet") so a row with nothing to offer shows no icon at all instead of a dead tap target. */
export type RowDownloadState = 'unavailable' | 'none' | 'queued' | 'downloading' | 'downloaded';

export interface DownloadContextValue {
  settings: DownloadSettings;
  setSettings: (next: DownloadSettings) => void;
  /** Queues one occasion's applicable content (per the current settings' content types) - the primitive every download affordance in the app calls, manual or automatic. */
  downloadOccasion: (entry: CatalogEntry) => void;
  enqueueBulk: (entries: CatalogEntry[]) => void;
  /**
   * Live in-memory state, keyed `"{hebrewYear}:{occasionId}"` (same shape as
   * player/progressStore.ts's own key()). A missing entry means "no
   * active/completed job in this session knows about this occasion," not
   * "not downloaded" - see `useDownloadState`, which falls back to a real
   * Cache Storage check for that case.
   */
  liveState: Record<string, RowDownloadState>;
}

export const DownloadContext = createContext<DownloadContextValue | null>(null);
