import { createContext } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { DownloadSettings } from '../settings/useDownloadSettings';

/**
 * `'unavailable'` - the current content-type settings select nothing at all
 * for this occasion (e.g. only "Mugah" is enabled and this one has none) -
 * is distinct from `'none'` ("downloadable, just not downloaded yet") so a
 * row with nothing to offer shows no icon at all instead of a dead tap
 * target. `'loading'` is its own distinct state too, not folded into
 * `'unavailable'` - the real Cache Storage check (useDownloadState) that
 * decides between `'none'`/`'downloaded'` is genuinely asynchronous, and a
 * row briefly showing no icon at all before one pops in reads as broken,
 * not as "this occasion has nothing to download."
 */
export type RowDownloadState = 'unavailable' | 'loading' | 'none' | 'queued' | 'downloading' | 'downloaded';

export interface DownloadContextValue {
  settings: DownloadSettings;
  setSettings: (next: DownloadSettings) => void;
  /** Queues one occasion's applicable content (per the current settings' content types) - the primitive every manual download affordance in the app calls. */
  downloadOccasion: (entry: CatalogEntry) => void;
  /** `source` (default `'manual'`) decides how this job is tracked in downloadLedger.ts - `'auto'` is only ever passed by useAutoDownloadSync; every UI-triggered bulk button leaves it as `'manual'`, exempting whatever it fetches from pruneAutoDownloads.ts for good. */
  enqueueBulk: (entries: CatalogEntry[], source?: 'auto' | 'manual') => void;
  /** Downloads exactly one chapter's audio, independent of the occasion-level `contentTypes` settings - RecordingsScreen's own per-row download affordance, for grabbing a single sicha without pulling in the whole farbrengen. */
  downloadChapter: (entry: CatalogEntry, chapterIndex: number) => void;
  /** Downloads every chapter's audio for one occasion - RecordingsScreen's own "download all" affordance, same independence from `contentTypes` as `downloadChapter` (this page is audio, unconditionally). */
  downloadAllChapters: (entry: CatalogEntry) => void;
  /**
   * Live in-memory state, keyed `"{hebrewYear}:{occasionId}"` for an
   * occasion-level job or `"chapter:{hebrewYear}:{occasionId}:{chapterIndex}"`
   * for a `downloadChapter` job (same shape as player/progressStore.ts's own
   * key(), plus the chapter variant). A missing entry means "no
   * active/completed job in this session knows about this occasion," not
   * "not downloaded" - see `useDownloadState`, which falls back to a real
   * Cache Storage check for that case.
   */
  liveState: Record<string, RowDownloadState>;
  /** Byte-progress (0-1) for a key currently `'downloading'` in `liveState` - absent once real byte counts aren't known yet (queued) or the job has settled (done/error), same key shapes as `liveState`. */
  progress: Record<string, number>;
  /**
   * Session-level file counts for the global progress bar, reset once all
   * active jobs finish. `total` is the cumulative number of distinct file
   * targets queued since the last idle state; `done` is how many have settled
   * (succeeded or errored). Using these rather than averaging per-occasion
   * fractions keeps the bar monotonically advancing even as individual
   * occasions complete and drop out of the active-key set.
   */
  sessionBatch: { total: number; done: number };
}

export const DownloadContext = createContext<DownloadContextValue | null>(null);

/** The `liveState`/`progress` key for one chapter's own download job - shared between `DownloadProvider` (which writes it) and `useChapterDownload` (which reads it), so they can never drift apart. */
export function chapterKey(hebrewYear: number, occasionId: number, chapterIndex: number): string {
  return `chapter:${hebrewYear}:${occasionId}:${chapterIndex}`;
}
