import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { DownloadContentTypes, DownloadTarget } from '@sichos-kodesh/app-core';
import { listDownloadTargets } from '@sichos-kodesh/app-core';
import type { AudioProfile, CollectionId, ObjectRef, PackEntry } from './manifest.js';
import { farbrengenItemId } from './manifest.js';
import type { ObjectsIndex } from './objectsIndex.js';
import { buildSourceLookup, sourceKey } from './objectsIndex.js';

/**
 * A selection is "these catalog entries, these content types, this audio
 * profile". Its size is exact because every object's size is in the
 * index; the download site shows it as the user toggles, the builder
 * packs it, and the app's own export uses the same function so all three
 * agree. Farbrengens only for now - the same shape will carry the other
 * collections when catalog schema 2 lands.
 */

export interface SelectionSize {
  /** sha256 -> bytes of every object the selection needs and the index knows. */
  objects: Record<string, number>;
  bytes: number;
  /** Targets the index has no object for (not yet archived, or not in this profile). */
  missing: DownloadTarget[];
  entries: PackEntry[];
}

export function selectionTargets(entries: CatalogEntry[], contentTypes: DownloadContentTypes): DownloadTarget[] {
  return listDownloadTargets(entries, contentTypes);
}

export function sizeSelection(entries: CatalogEntry[], contentTypes: DownloadContentTypes, index: ObjectsIndex, profile: AudioProfile): SelectionSize {
  const lookup = buildSourceLookup(index);
  const result: SelectionSize = { objects: {}, bytes: 0, missing: [], entries: [] };
  const byOccasion = new Map<string, PackEntry>();
  // The catalog entry of each occasion, and of each occasion in its year: found once, not searched per file.
  const firstOf = new Map<number, CatalogEntry>();
  const ofYear = new Map<string, CatalogEntry>();
  for (const e of entries) {
    if (!firstOf.has(e.occasionId)) firstOf.set(e.occasionId, e);
    const key = `${e.occasionId}:${e.hebrewYear}`;
    if (!ofYear.has(key)) ofYear.set(key, e);
  }
  const collection: CollectionId = 'farbrengens';
  for (const target of listDownloadTargets(entries, contentTypes)) {
    const kind = target.kind;
    const sourceId = kind === 'audio' ? target.workerFilename : target.driveFileId;
    if (!sourceId) continue;
    const sha = lookup.get(sourceKey(kind, sourceId, kind === 'audio' ? profile : undefined));
    const indexed = sha ? index.objects[sha] : undefined;
    if (!sha || !indexed) {
      result.missing.push(target);
      continue;
    }
    if (result.objects[sha] === undefined) {
      result.objects[sha] = indexed.bytes;
      result.bytes += indexed.bytes;
    }
    const itemId = farbrengenItemId(target.occasionId);
    let entry = byOccasion.get(itemId);
    if (!entry) {
      const source = ofYear.get(`${target.occasionId}:${target.hebrewYear}`);
      entry = { collection, itemId, hebrewYear: target.hebrewYear, refs: [] };
      if (source) {
        entry.hebrewDate = source.hebrewDate;
        entry.label = source.occasionLabel;
      }
      byOccasion.set(itemId, entry);
      result.entries.push(entry);
    }
    const ref: ObjectRef = { sha256: sha, bytes: indexed.bytes, kind, sourceId };
    if (kind === 'audio') {
      ref.profile = profile;
      if (target.chapterIndex !== undefined) ref.role = String(target.chapterIndex);
      const audio = firstOf.get(target.occasionId)?.audio.find((a) => a.workerFilename === sourceId);
      if (audio?.durationMs !== undefined) ref.durationMs = audio.durationMs;
    } else if (target.section) {
      ref.role = target.section;
    }
    if (target.label) ref.label = target.label;
    entry.refs.push(ref);
  }
  return result;
}
