import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseRecentSearches, rememberSearch } from '@sichos-kodesh/app-core';

const STORAGE_KEY = 'sichos-kodesh:recent-searches';

/** The searches made lately on this phone, newest first (web: useRecentSearches; app-core's rememberSearch): shown before typing, and cleared on request. */
export function useRecentSearches(): { recent: string[]; remember: (query: string) => void; clear: () => void } {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!cancelled && value) setRecent(parseRecentSearches(JSON.parse(value)));
      })
      .catch(() => {
        // Best-effort persistence only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const store = (list: string[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list)).catch(() => {
      // Best-effort persistence only.
    });
  };

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
