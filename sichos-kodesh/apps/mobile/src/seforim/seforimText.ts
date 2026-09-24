import RNBlobUtil from 'react-native-blob-util';
import type { CatalogEdition, CatalogUnit, CatalogWork } from '@sichos-kodesh/catalog';
import { TextLoadError, fetchFromSefaria, type TextFetch } from '@sichos-kodesh/app-core';
import { documentPath, readHeldObjects } from '../offline/objectStore';
import { getSavedState, savedTextPath } from './savedStore';

/**
 * A unit's text in one edition, from wherever the phone can get it:
 * 1. its text object, when a text pack put it on the phone (found by the
 *    sha256 the catalog names);
 * 2. its saved copy, when the sefer was saved on the phone (savedStore.ts);
 * 3. otherwise Sefaria, read live and rendered by the same code that made
 *    the packs, so it looks the same (app-core's `fetchFromSefaria`, which
 *    the web reads with too).
 * Only editions whose source may ship come here (the reader shows the
 * others as links).
 */

export type TextFrom = 'phone' | 'sefaria';

export interface LoadedText {
  html: string;
  from: TextFrom;
}

export { TextLoadError, fetchFromSefaria, type TextProblem } from '@sichos-kodesh/app-core';

/** The file of a held text object, relative to the files directory, or null. */
export async function heldTextFile(sha256: string | undefined): Promise<string | null> {
  if (!sha256) return null;
  const held = await readHeldObjects();
  return held[sha256]?.file ?? null;
}

/**
 * The files that may hold a unit's text in one edition, best first: the
 * pack's text object, then the saved copy. Relative to the files
 * directory; either may be missing on disk.
 */
export async function unitTextFiles(workId: string, unitId: string, edition: CatalogEdition): Promise<string[]> {
  const files: string[] = [];
  const held = await heldTextFile(edition.sha256);
  if (held) files.push(held);
  if ((await getSavedState()).seforim[workId]) files.push(savedTextPath(workId, unitId, edition.source));
  return files;
}

/** The first of a unit's text files that can be read, or null. */
export async function readUnitTextFile(workId: string, unitId: string, edition: CatalogEdition): Promise<string | null> {
  for (const file of await unitTextFiles(workId, unitId, edition)) {
    try {
      return String(await RNBlobUtil.fs.readFile(documentPath(file), 'utf8'));
    } catch {
      // Missing (a sefer saved in part, a file removed): try the next.
    }
  }
  return null;
}

export async function loadUnitText(work: CatalogWork, unit: CatalogUnit, edition: CatalogEdition, online: boolean, fetchFn?: TextFetch): Promise<LoadedText> {
  const html = await readUnitTextFile(work.id, unit.id, edition);
  if (html !== null) return { html, from: 'phone' };
  if (!online) throw new TextLoadError('offline');
  return { html: await fetchFromSefaria(work, unit, edition, fetchFn), from: 'sefaria' };
}
