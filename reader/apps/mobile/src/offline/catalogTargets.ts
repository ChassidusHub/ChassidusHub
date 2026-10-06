import type { CatalogByYear, CatalogEntry } from '@chassidushub-reader/catalog';
import type { DownloadTarget } from '@chassidushub-reader/app-core';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@chassidushub-reader/app-core';

/**
 * Imported files become "downloaded" the same way a download does: a
 * StoredDownloadRecord per catalog download target. These helpers find the
 * targets a file serves, by its upstream id (a JEM `workerFilename` or a
 * Drive `driveFileId`), in the catalog the phone has now.
 */

/** The upstream id a target downloads. */
export function targetSourceId(target: DownloadTarget): string | undefined {
  return target.kind === 'audio' ? target.workerFilename : target.driveFileId;
}

/** upstream id -> every download target for it (one file can serve several occasions). */
export function targetsBySourceId(entries: CatalogEntry[]): Map<string, DownloadTarget[]> {
  const map = new Map<string, DownloadTarget[]>();
  for (const target of listDownloadTargets(entries, ALL_CONTENT_TYPES)) {
    const id = targetSourceId(target);
    if (!id) continue;
    const list = map.get(id);
    if (list) list.push(target);
    else map.set(id, [target]);
  }
  return map;
}

export function findCatalogEntry(catalog: CatalogByYear, hebrewYear: number, occasionId: number): CatalogEntry | undefined {
  return catalog[hebrewYear]?.find((entry) => entry.occasionId === occasionId);
}

/** Every farbrengen the catalog lists: the lookup space for a shared file known only by its name. */
export function allCatalogEntries(catalog: CatalogByYear): CatalogEntry[] {
  return Object.values(catalog).flat();
}

/** Whether the catalog lists this upstream id anywhere (as a recording or any PDF, target or not). */
export function catalogKnowsSource(entries: CatalogEntry[], kind: 'audio' | 'pdf', sourceId: string): boolean {
  return entries.some((entry) => (kind === 'audio' ? entry.audio.some((a) => a.workerFilename === sourceId) : entry.pdfs.some((p) => p.driveFileId === sourceId)));
}
