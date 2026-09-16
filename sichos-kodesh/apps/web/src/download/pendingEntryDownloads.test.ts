import { beforeEach, describe, expect, it } from 'vitest';
import { addPendingEntryDownload, clearPendingEntryDownloads, listPendingEntryDownloads, removePendingEntryDownload } from './pendingEntryDownloads';

/** This test environment has no browser `localStorage` global at all - a minimal in-memory stand-in, just enough of the Storage interface pendingEntryDownloads.ts actually calls. */
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

describe('pendingEntryDownloads', () => {
  beforeEach(() => {
    installFakeLocalStorage();
  });

  it('lists an added pending entry download', () => {
    addPendingEntryDownload({ hebrewYear: 5736, occasionId: 1, source: 'manual' });
    expect(listPendingEntryDownloads()).toEqual([{ hebrewYear: 5736, occasionId: 1, source: 'manual' }]);
  });

  it('does not duplicate the same occasion added twice, keeping the first source', () => {
    addPendingEntryDownload({ hebrewYear: 5736, occasionId: 1, source: 'manual' });
    addPendingEntryDownload({ hebrewYear: 5736, occasionId: 1, source: 'auto' });
    expect(listPendingEntryDownloads()).toEqual([{ hebrewYear: 5736, occasionId: 1, source: 'manual' }]);
  });

  it('keeps distinct occasions separate', () => {
    addPendingEntryDownload({ hebrewYear: 5736, occasionId: 1, source: 'manual' });
    addPendingEntryDownload({ hebrewYear: 5736, occasionId: 2, source: 'auto' });
    expect(listPendingEntryDownloads()).toHaveLength(2);
  });

  it('removes exactly the requested entry, leaving the rest', () => {
    addPendingEntryDownload({ hebrewYear: 5736, occasionId: 1, source: 'manual' });
    addPendingEntryDownload({ hebrewYear: 5736, occasionId: 2, source: 'auto' });
    removePendingEntryDownload({ hebrewYear: 5736, occasionId: 1 });
    expect(listPendingEntryDownloads()).toEqual([{ hebrewYear: 5736, occasionId: 2, source: 'auto' }]);
  });

  it('is empty by default', () => {
    expect(listPendingEntryDownloads()).toEqual([]);
  });

  it('removing a non-existent entry is a no-op', () => {
    addPendingEntryDownload({ hebrewYear: 5736, occasionId: 1, source: 'manual' });
    removePendingEntryDownload({ hebrewYear: 5736, occasionId: 99 });
    expect(listPendingEntryDownloads()).toHaveLength(1);
  });

  it('clearPendingEntryDownloads empties the whole list', () => {
    addPendingEntryDownload({ hebrewYear: 5736, occasionId: 1, source: 'manual' });
    addPendingEntryDownload({ hebrewYear: 5736, occasionId: 2, source: 'auto' });
    clearPendingEntryDownloads();
    expect(listPendingEntryDownloads()).toEqual([]);
  });
});
