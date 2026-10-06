import { useState } from 'react';
import { parseRecentSearches, rememberSearch } from '@chassidushub-reader/app-core';

const STORAGE_KEY = 'chassidushub:recent-searches';

function readStored(): string[] {
  try {
    return parseRecentSearches(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

function store(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Best-effort persistence only.
  }
}

/** The searches made lately on this device, newest first (app-core's rememberSearch): shown before typing, and cleared on request. */
export function useRecentSearches(): { recent: string[]; remember: (query: string) => void; clear: () => void } {
  const [recent, setRecent] = useState<string[]>(readStored);
  return {
    recent,
    remember: (query) =>
      setRecent((prev) => {
        const next = rememberSearch(prev, query);
        store(next);
        return next;
      }),
    clear: () => {
      store([]);
      setRecent([]);
    },
  };
}
