import { canonicalBytes } from './canonical.js';
import type { AudioProfile, PackEntry, PackManifest, PackScope } from './manifest.js';
import { PACK_EXTENSION, PACK_SCHEMA_VERSION } from './manifest.js';

/**
 * From a sized selection to the manifests of its pack(s), without touching
 * bytes: the pack builder writes files from them and the pack API streams
 * them, so both give the same packs. Hashing is passed in (Node's crypto,
 * or WebCrypto in a Worker).
 */

export type HashHex = (bytes: Uint8Array) => string | Promise<string>;

export interface PackPart {
  entries: PackEntry[];
  objects: Record<string, number>;
  bytes: number;
}

/**
 * Greedy, in catalog order, whole occasions only: a manifest may only
 * refer to objects its own part carries, so an occasion is never cut in
 * two. An object two occasions share is carried by each part that needs it.
 */
export function splitEntries(entries: PackEntry[], maxBytes: number): PackPart[] {
  const parts: PackPart[] = [];
  let current: PackPart = { entries: [], objects: {}, bytes: 0 };
  const extraFor = (part: PackPart, entry: PackEntry): number => {
    const seen = new Set<string>();
    let extra = 0;
    for (const ref of entry.refs) {
      if (part.objects[ref.sha256] !== undefined || seen.has(ref.sha256)) continue;
      seen.add(ref.sha256);
      extra += ref.bytes;
    }
    return extra;
  };
  for (const entry of entries) {
    if (current.entries.length > 0 && current.bytes + extraFor(current, entry) > maxBytes) {
      parts.push(current);
      current = { entries: [], objects: {}, bytes: 0 };
    }
    current.entries.push(entry);
    for (const ref of entry.refs) {
      if (current.objects[ref.sha256] !== undefined) continue;
      current.objects[ref.sha256] = ref.bytes;
      current.bytes += ref.bytes;
    }
  }
  if (current.entries.length > 0) parts.push(current);
  return parts;
}

/** What a pack id hashes: stable for a selection, so the same scope, profile and objects always give the same id. */
export function packIdPayload(scope: PackScope, profile: AudioProfile, objects: Record<string, number>, part?: number): Uint8Array {
  return canonicalBytes({ scope, profile, objects, ...(part === undefined ? {} : { part }) });
}

export interface ComposeOptions {
  scope: PackScope;
  profile: AudioProfile;
  catalogVersion: string;
  builtAt: string;
  parts: PackPart[];
  hash: HashHex;
  /** Stamps for objects.json and catalog.json, when the pack carries them. */
  objectsIndex?: { version: string; sha256: string };
  catalog?: { version: string; sha256: string };
}

/** The unsigned manifest of each part. A split set shares one `setId`: the id the whole selection would have as one pack. */
export async function composeManifests(options: ComposeOptions): Promise<PackManifest[]> {
  const allObjects: Record<string, number> = {};
  for (const part of options.parts) Object.assign(allObjects, part.objects);
  const setId = await options.hash(packIdPayload(options.scope, options.profile, allObjects));
  const split = options.parts.length > 1;
  const manifests: PackManifest[] = [];
  for (const [i, part] of options.parts.entries()) {
    const manifest: PackManifest = {
      schema: PACK_SCHEMA_VERSION,
      packId: split ? await options.hash(packIdPayload(options.scope, options.profile, part.objects, i)) : setId,
      builtAt: options.builtAt,
      catalogVersion: options.catalogVersion,
      profile: { audio: options.profile },
      scope: options.scope,
      entries: part.entries,
      objects: part.objects,
    };
    if (split) manifest.part = { index: i, count: options.parts.length, setId };
    if (options.objectsIndex) manifest.objectsIndex = options.objectsIndex;
    if (options.catalog) manifest.catalog = options.catalog;
    manifests.push(manifest);
  }
  return manifests;
}

/** `5736-01-tishrei-src.skpack`, `5736-src.part2of3.skpack`. */
export function packFileName(slug: string, profile: AudioProfile, part?: { index: number; count: number }): string {
  return `${slug}-${profile}${part && part.count > 1 ? `.part${part.index + 1}of${part.count}` : ''}${PACK_EXTENSION}`;
}
