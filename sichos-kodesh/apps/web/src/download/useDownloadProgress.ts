import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { useDownload } from './useDownload';

function key(hebrewYear: number, occasionId: number): string {
  return `${hebrewYear}:${occasionId}`;
}

/** Byte-progress (0-1) for one occasion's own download job - `undefined` when it isn't actively downloading, or its progress isn't known yet (see DownloadContextValue.progress). */
export function useDownloadProgress(entry: CatalogEntry | null | undefined): number | undefined {
  const { progress } = useDownload();
  if (!entry) return undefined;
  return progress[key(entry.hebrewYear, entry.occasionId)];
}
