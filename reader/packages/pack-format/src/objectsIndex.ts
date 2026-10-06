import type { AudioProfile, CollectionId, ObjectKind } from './manifest.js';
import { AUDIO_PROFILES, COLLECTION_IDS, OBJECT_KINDS, isSha256 } from './manifest.js';

/**
 * objects.json: everything the archive holds, by hash. The trust anchor for
 * files that arrive without a signed manifest (a zip a bochur passed on, a
 * folder copied by hand): a file whose sha256 is in the index is the right
 * bytes by definition, whatever it was called. Published with the catalog,
 * embedded in every pack, bundled in the app.
 */

export const OBJECTS_INDEX_SCHEMA_VERSION = 1 as const;

export interface ObjectIndexEntry {
  kind: ObjectKind;
  profile?: AudioProfile;
  bytes: number;
  /** JEM `workerFilename`, Drive `driveFileId`, or a text id. */
  sourceId: string;
  /**
   * Other source ids upstream serves exactly these bytes under (JEM lists
   * one recording under two file names; a PDF uploaded to Drive twice), so
   * every name a catalog uses finds its object. Absent when there is none.
   */
  aliases?: string[];
  collection: CollectionId;
  itemId: string;
}

export interface ObjectsIndex {
  schema: typeof OBJECTS_INDEX_SCHEMA_VERSION;
  /** The catalog version this index was built with. */
  version: string;
  builtAt: string;
  objects: Record<string, ObjectIndexEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseObjectIndexEntry(value: unknown): ObjectIndexEntry | null {
  if (!isRecord(value)) return null;
  const { kind, profile, bytes, sourceId, aliases, collection, itemId } = value;
  if (typeof kind !== 'string' || !(OBJECT_KINDS as readonly string[]).includes(kind)) return null;
  if (profile !== undefined && (typeof profile !== 'string' || !(AUDIO_PROFILES as readonly string[]).includes(profile))) return null;
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0) return null;
  if (typeof sourceId !== 'string' || sourceId.length === 0) return null;
  if (typeof collection !== 'string' || !(COLLECTION_IDS as readonly string[]).includes(collection)) return null;
  if (typeof itemId !== 'string' || itemId.length === 0) return null;
  if (aliases !== undefined && (!Array.isArray(aliases) || !aliases.every((a) => typeof a === 'string' && a.length > 0))) return null;
  const entry: ObjectIndexEntry = { kind: kind as ObjectKind, bytes, sourceId, collection: collection as CollectionId, itemId };
  if (profile !== undefined) entry.profile = profile as AudioProfile;
  if (aliases !== undefined && aliases.length > 0) entry.aliases = aliases as string[];
  return entry;
}

export function parseObjectsIndex(value: unknown): ObjectsIndex | null {
  if (!isRecord(value) || value.schema !== OBJECTS_INDEX_SCHEMA_VERSION) return null;
  if (typeof value.version !== 'string' || typeof value.builtAt !== 'string' || !isRecord(value.objects)) return null;
  const objects: Record<string, ObjectIndexEntry> = {};
  for (const [sha, entry] of Object.entries(value.objects)) {
    if (!isSha256(sha)) return null;
    const parsed = parseObjectIndexEntry(entry);
    if (!parsed) return null;
    objects[sha] = parsed;
  }
  return { schema: OBJECTS_INDEX_SCHEMA_VERSION, version: value.version, builtAt: value.builtAt, objects };
}

/** `kind:profile:sourceId` - how a catalog reference finds its object in the index. */
export function sourceKey(kind: ObjectKind, sourceId: string, profile?: AudioProfile): string {
  return `${kind}:${kind === 'audio' ? (profile ?? 'src') : '-'}:${sourceId}`;
}

/** Reverse lookup, built once per index: source key -> sha256, for each object's source id and its aliases. A source id always wins over another object's alias. */
export function buildSourceLookup(index: ObjectsIndex): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [sha, entry] of Object.entries(index.objects)) {
    lookup.set(sourceKey(entry.kind, entry.sourceId, entry.profile), sha);
  }
  for (const [sha, entry] of Object.entries(index.objects)) {
    for (const alias of entry.aliases ?? []) {
      const key = sourceKey(entry.kind, alias, entry.profile);
      if (!lookup.has(key)) lookup.set(key, sha);
    }
  }
  return lookup;
}
