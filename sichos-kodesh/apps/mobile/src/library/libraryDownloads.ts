import RNBlobUtil from 'react-native-blob-util';
import type { CatalogLibrary, LibraryCollectionId, LibraryItemBase } from '@sichos-kodesh/catalog';
import { LIBRARY_COLLECTION_IDS } from '@sichos-kodesh/catalog';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import { deleteTargetDownloads, fileNameForTarget, listStoredDownloads, localPathForTarget } from '../download/downloadStorage';
import { playlistOccasionId } from './libraryModel';

/**
 * Downloads for library items go through the same queue, executor and
 * paths as a farbrengen's: a target per file, keyed `lib:…` so it never
 * collides with an occasion's, with the item's own playlist id as its
 * occasion. A file both a farbrengen and a library item list (a maamar's
 * PDF) is one file on the phone, downloaded once.
 */

export function libraryTargetKey(collection: LibraryCollectionId, itemId: string, kind: 'audio' | 'pdf', sourceId: string): string {
  return `lib:${collection}:${itemId}:${kind}:${sourceId}`;
}

export function isLibraryTargetKey(key: string): boolean {
  return key.startsWith('lib:');
}

/** The item a library target belongs to. Item ids can hold a colon (Likkutei Sichos' `20:381`); the kind and file id never do. */
export function parseLibraryTargetKey(key: string): { collection: LibraryCollectionId; itemId: string } | null {
  if (!isLibraryTargetKey(key)) return null;
  const parts = key.split(':');
  if (parts.length < 5) return null;
  const collection = parts[1] as LibraryCollectionId;
  if (!(LIBRARY_COLLECTION_IDS as readonly string[]).includes(collection)) return null;
  return { collection, itemId: parts.slice(2, -2).join(':') };
}

/** One target per recording and PDF of an item (texts are not downloadable files yet). */
export function libraryItemTargets(collection: LibraryCollectionId, item: LibraryItemBase): DownloadTarget[] {
  const occasionId = playlistOccasionId(collection, item);
  const targets: DownloadTarget[] = [];
  let chapterIndex = 0;
  for (const ref of item.refs) {
    if (ref.kind === 'audio') {
      targets.push({ key: libraryTargetKey(collection, item.id, 'audio', ref.sourceId), hebrewYear: item.hebrewYear ?? 0, occasionId, label: item.label, kind: 'audio', chapterIndex, workerFilename: ref.sourceId });
      chapterIndex += 1;
    } else if (ref.kind === 'pdf') {
      targets.push({
        key: libraryTargetKey(collection, item.id, 'pdf', ref.sourceId),
        hebrewYear: item.hebrewYear ?? 0,
        occasionId,
        label: item.label,
        kind: 'pdf',
        driveFileId: ref.sourceId,
        resourceKey: ref.resourceKey ?? null,
      });
    }
  }
  return targets;
}

const fileNameCache = new WeakMap<CatalogLibrary, Set<string>>();

/** The file name of every recording and PDF the library lists: what storage usage and "Delete all" also cover. Computed once per library. */
export function libraryFileNames(library: CatalogLibrary): Set<string> {
  const cached = fileNameCache.get(library);
  if (cached) return cached;
  const names = new Set<string>();
  for (const collection of LIBRARY_COLLECTION_IDS) {
    for (const item of library.collections[collection].items as LibraryItemBase[]) {
      for (const target of libraryItemTargets(collection, item)) names.add(fileNameForTarget(target));
    }
  }
  fileNameCache.set(library, names);
  return names;
}

export interface DownloadedLibraryItem {
  collection: LibraryCollectionId;
  item: LibraryItemBase;
  targets: DownloadTarget[];
}

/**
 * Library items with every file on the phone, for the Downloaded screen.
 * Items whose files came with a farbrengen count too: they open offline
 * all the same. `files` is the listing of the files directory.
 */
export function downloadedLibraryItems(library: CatalogLibrary, files: ReadonlySet<string>): DownloadedLibraryItem[] {
  const result: DownloadedLibraryItem[] = [];
  for (const collection of LIBRARY_COLLECTION_IDS) {
    for (const item of library.collections[collection].items as LibraryItemBase[]) {
      const targets = libraryItemTargets(collection, item);
      if (targets.length > 0 && targets.every((target) => files.has(fileNameForTarget(target)))) result.push({ collection, item, targets });
    }
  }
  return result;
}

/** The library items whose files are all on the phone, from one listing of the files directory. */
export async function listDownloadedLibraryItems(library: CatalogLibrary): Promise<DownloadedLibraryItem[]> {
  let files: string[] = [];
  try {
    files = await RNBlobUtil.fs.ls(RNBlobUtil.fs.dirs.DocumentDir);
  } catch {
    files = [];
  }
  return downloadedLibraryItems(library, new Set(files));
}

/**
 * Deletes a library item's files, except any a downloaded farbrengen also
 * uses (a maamar's PDF is often a farbrengen's too): deleting the item
 * must not take a farbrengen's download with it.
 */
export async function deleteLibraryItemFiles(targets: DownloadTarget[]): Promise<void> {
  const records = await listStoredDownloads();
  const keep = new Set(records.filter((record) => !isLibraryTargetKey(record.key)).map((record) => record.localPath));
  await deleteTargetDownloads(targets.filter((target) => !keep.has(localPathForTarget(target))));
}
