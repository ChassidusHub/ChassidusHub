import { useState } from 'react';
import { readProgressMap } from './progressStore';
import type { ProgressStore } from './progressStore';

/** Reads the listening-progress store once per mount - shared by every occasion list so a long list (YearBrowserScreen can run 60+ rows) does one localStorage read total, not one per row. */
export function useProgressMap(): ProgressStore {
  const [map] = useState(readProgressMap);
  return map;
}
