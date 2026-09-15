import { beforeEach, describe, expect, it } from 'vitest';
import { addPendingChapterDownload, listPendingChapterDownloads, removePendingChapterDownload } from './pendingDownloads';

/** This test environment has no browser `localStorage` global at all - a minimal in-memory stand-in, just enough of the Storage interface pendingDownloads.ts actually calls. */
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

describe('pendingDownloads', () => {
  beforeEach(() => {
    installFakeLocalStorage();
  });

  it('lists an added pending chapter download', () => {
    addPendingChapterDownload({ hebrewYear: 5736, occasionId: 1, chapterIndex: 0 });
    expect(listPendingChapterDownloads()).toEqual([{ hebrewYear: 5736, occasionId: 1, chapterIndex: 0 }]);
  });

  it('does not duplicate the same chapter added twice', () => {
    addPendingChapterDownload({ hebrewYear: 5736, occasionId: 1, chapterIndex: 0 });
    addPendingChapterDownload({ hebrewYear: 5736, occasionId: 1, chapterIndex: 0 });
    expect(listPendingChapterDownloads()).toHaveLength(1);
  });

  it('keeps distinct chapters of the same occasion separate', () => {
    addPendingChapterDownload({ hebrewYear: 5736, occasionId: 1, chapterIndex: 0 });
    addPendingChapterDownload({ hebrewYear: 5736, occasionId: 1, chapterIndex: 1 });
    expect(listPendingChapterDownloads()).toHaveLength(2);
  });

  it('removes exactly the requested entry, leaving the rest', () => {
    addPendingChapterDownload({ hebrewYear: 5736, occasionId: 1, chapterIndex: 0 });
    addPendingChapterDownload({ hebrewYear: 5736, occasionId: 1, chapterIndex: 1 });
    removePendingChapterDownload({ hebrewYear: 5736, occasionId: 1, chapterIndex: 0 });
    expect(listPendingChapterDownloads()).toEqual([{ hebrewYear: 5736, occasionId: 1, chapterIndex: 1 }]);
  });

  it('is empty by default', () => {
    expect(listPendingChapterDownloads()).toEqual([]);
  });

  it('removing a non-existent entry is a no-op', () => {
    addPendingChapterDownload({ hebrewYear: 5736, occasionId: 1, chapterIndex: 0 });
    removePendingChapterDownload({ hebrewYear: 5736, occasionId: 1, chapterIndex: 5 });
    expect(listPendingChapterDownloads()).toHaveLength(1);
  });
});
