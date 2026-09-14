import { useEffect } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { recordVisit } from './progressStore';

/** Marks an occasion page as visited (see progressStore.ts) as soon as it's opened - drives the home page's Continue section, independent of whether anything is actually played. Shared by FarbrengenScreen and OccasionScreen, the two screens an occasion is ever actually viewed on. */
export function useRecordVisit(entry: CatalogEntry | null | undefined): void {
  useEffect(() => {
    if (!entry) return;
    recordVisit(entry.hebrewYear, entry.occasionId, entry.occasionLabel);
  }, [entry]);
}
