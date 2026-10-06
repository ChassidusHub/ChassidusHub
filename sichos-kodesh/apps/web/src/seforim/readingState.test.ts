import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getReadingState, isBookmarked, recordPlace, resetReadingState, setReaderSettings, toggleBookmark } from './readingState';

const KEY = 'sichos-kodesh:seforim-reading';

function memoryStorage(initial: Record<string, string> = {}) {
  const rows = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    },
    removeItem: (key: string) => {
      rows.delete(key);
    },
    rows,
  };
}

describe('the web reading state', () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    resetReadingState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetReadingState();
  });

  it('keeps settings, places and bookmarks in one localStorage row', () => {
    setReaderSettings({ font: 'david', theme: 'sepia' });
    recordPlace('tanya', 'part1/2', 0, 0.4567, new Date('2026-09-24T12:00:00Z'));
    toggleBookmark('tanya', 'part1/2', new Date('2026-09-24T12:00:00Z'));

    const saved = JSON.parse(storage.rows.get(KEY)!);
    expect(saved.settings).toMatchObject({ font: 'david', theme: 'sepia' });
    expect(saved.places.tanya).toMatchObject({ unitId: 'part1/2', source: 0, offset: 0.457 });
    expect(isBookmarked(getReadingState(), 'tanya', 'part1/2')).toBe(true);
  });

  it('reads the row back on the next visit', () => {
    setReaderSettings({ scale: 1.4 });
    resetReadingState();
    expect(getReadingState().settings.scale).toBe(1.4);
  });

  it('starts empty on a damaged row, and keeps working when storage refuses writes', () => {
    storage.rows.set(KEY, '{not json');
    resetReadingState();
    expect(getReadingState().places).toEqual({});

    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    setReaderSettings({ niqqud: false });
    expect(getReadingState().settings.niqqud).toBe(false);
  });
});
