import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pruneAutoDownloads } from './pruneAutoDownloads';
import { recordAutoDownload, listAutoDownloads } from './downloadLedger';
import { recordChapterProgress, recordVisit } from '../player/progressStore';
import { DEFAULT_DOWNLOAD_SETTINGS } from '../settings/useDownloadSettings';
import type { DownloadSettings } from '../settings/useDownloadSettings';

vi.mock('../catalog/data', () => ({
  default: {
    5711: [
      {
        hebrewYear: 5711,
        occasionId: 1,
        hebrewDate: '5711-05-10',
        occasionLabel: 'Occasion A',
        audio: [{ workerFilename: 'a.mp3', durationMs: 60000, chapterName: 'Ch1' }],
        pdfs: [],
      },
      {
        hebrewYear: 5711,
        occasionId: 2,
        hebrewDate: '5711-05-11',
        occasionLabel: 'Occasion B',
        audio: [{ workerFilename: 'b.mp3', durationMs: 60000, chapterName: 'Ch1' }],
        pdfs: [],
      },
    ],
  },
}));

/** This test environment has no browser `localStorage` global at all - a minimal in-memory stand-in, just enough of the Storage interface the ledger/progress store actually call. */
function installFakeLocalStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

/** Minimal fake of the Cache Storage API - just enough of `caches.open`/`Cache#delete` to verify which URLs pruneAutoDownloads actually deletes. */
function installFakeCaches(): { deleted: string[] } {
  const deleted: string[] = [];
  const cache = { delete: async (url: string) => void deleted.push(url) };
  (globalThis as { caches?: typeof caches }).caches = { open: async () => cache } as unknown as typeof caches;
  return { deleted };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function settingsWith(overrides: Partial<DownloadSettings>): DownloadSettings {
  return { ...DEFAULT_DOWNLOAD_SETTINGS, ...overrides };
}

describe('pruneAutoDownloads', () => {
  let fakeCache: { deleted: string[] };

  beforeEach(() => {
    installFakeLocalStorage();
    fakeCache = installFakeCaches();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when retentionPeriod is "never"', async () => {
    recordAutoDownload('https://example.com/a.mp3', 5711, 1);
    vi.setSystemTime(new Date(Date.now() + 100 * WEEK_MS));
    await pruneAutoDownloads(settingsWith({ retentionPeriod: 'never' }));
    expect(fakeCache.deleted).toEqual([]);
    expect(listAutoDownloads()).toHaveLength(1);
  });

  it('leaves a recently auto-downloaded file alone', async () => {
    recordAutoDownload('https://example.com/a.mp3', 5711, 1);
    await pruneAutoDownloads(settingsWith({ retentionPeriod: '2w' }));
    expect(fakeCache.deleted).toEqual([]);
  });

  it('deletes an auto-downloaded file once past its retention window, with nothing else protecting it', async () => {
    recordAutoDownload('https://example.com/a.mp3', 5711, 1);
    vi.setSystemTime(new Date(Date.now() + 3 * WEEK_MS));
    await pruneAutoDownloads(settingsWith({ retentionPeriod: '2w', keepFinishedContent: false }));
    expect(fakeCache.deleted).toEqual(['https://example.com/a.mp3']);
    expect(listAutoDownloads()).toEqual([]);
  });

  it('never deletes a URL a manual download never tracked in the ledger at all', async () => {
    // No recordAutoDownload call at all - simulates a manually-downloaded or opportunistically-cached file.
    vi.setSystemTime(new Date(Date.now() + 100 * WEEK_MS));
    await pruneAutoDownloads(settingsWith({ retentionPeriod: '2w' }));
    expect(fakeCache.deleted).toEqual([]);
  });

  it('keeps a stale auto-download that was visited after it was cached', async () => {
    recordAutoDownload('https://example.com/a.mp3', 5711, 1);
    vi.setSystemTime(new Date(Date.now() + 1 * WEEK_MS));
    recordVisit(5711, 1, 'Occasion A'); // Opened partway through the retention window.
    vi.setSystemTime(new Date(Date.now() + 2 * WEEK_MS));
    await pruneAutoDownloads(settingsWith({ retentionPeriod: '2w' }));
    expect(fakeCache.deleted).toEqual([]);
  });

  it('keeps a finished occasion past retention when keepFinishedContent is on', async () => {
    recordAutoDownload('https://example.com/a.mp3', 5711, 1);
    recordChapterProgress(5711, 1, 'Occasion A', 0, 60, 60); // Fully listened.
    vi.setSystemTime(new Date(Date.now() + 3 * WEEK_MS));
    await pruneAutoDownloads(settingsWith({ retentionPeriod: '2w', keepFinishedContent: true }));
    expect(fakeCache.deleted).toEqual([]);
  });

  it('deletes a finished occasion past retention when keepFinishedContent is off', async () => {
    recordAutoDownload('https://example.com/a.mp3', 5711, 1);
    recordChapterProgress(5711, 1, 'Occasion A', 0, 60, 60);
    vi.setSystemTime(new Date(Date.now() + 3 * WEEK_MS));
    await pruneAutoDownloads(settingsWith({ retentionPeriod: '2w', keepFinishedContent: false }));
    expect(fakeCache.deleted).toEqual(['https://example.com/a.mp3']);
  });

  it('only prunes the stale entry, leaving a still-fresh one from a different occasion untouched', async () => {
    recordAutoDownload('https://example.com/a.mp3', 5711, 1);
    vi.setSystemTime(new Date(Date.now() + 3 * WEEK_MS));
    recordAutoDownload('https://example.com/b.mp3', 5711, 2); // Just (re-)claimed - not stale yet.
    await pruneAutoDownloads(settingsWith({ retentionPeriod: '2w', keepFinishedContent: false }));
    expect(fakeCache.deleted).toEqual(['https://example.com/a.mp3']);
    expect(listAutoDownloads().map((e) => e.url)).toEqual(['https://example.com/b.mp3']);
  });
});
