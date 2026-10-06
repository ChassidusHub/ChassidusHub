import type { PackManifest } from './manifest.js';
import { isSha256, parsePackManifest } from './manifest.js';

/**
 * Delta is set difference over object hashes: what a pack (or a set of
 * packs) holds that the phone does not. The station uses it to decide what
 * to copy; the phone uses it to skip what it already has while importing.
 */

export interface Delta {
  /** Objects in the manifest the phone lacks, in manifest order. */
  missing: string[];
  missingBytes: number;
  /** Objects in the manifest the phone already holds. */
  present: number;
  presentBytes: number;
}

export function computeDelta(manifest: Pick<PackManifest, 'objects'>, have: Iterable<string>): Delta {
  const held = have instanceof Set ? (have as Set<string>) : new Set(have);
  const delta: Delta = { missing: [], missingBytes: 0, present: 0, presentBytes: 0 };
  for (const [sha, bytes] of Object.entries(manifest.objects)) {
    if (held.has(sha)) {
      delta.present += 1;
      delta.presentBytes += bytes;
    } else {
      delta.missing.push(sha);
      delta.missingBytes += bytes;
    }
  }
  return delta;
}

/** One line of a download-site or station `index.json`. */
export interface PackIndexEntry {
  packId: string;
  file: string;
  bytes: number;
  sha256: string;
  catalogVersion: string;
  profile: string;
  scope: PackManifest['scope'];
  /** sha256 -> bytes, the pack's own object list, so the delta is computable without downloading it. */
  objects: Record<string, number>;
  /** Set when the pack is one part of a split scope. */
  part?: PackManifest['part'];
}

export const PACK_INDEX_SCHEMA_VERSION = 1 as const;

/** `index.json` next to the built packs: what the download site and the station read. */
export interface PackIndexFile {
  schema: typeof PACK_INDEX_SCHEMA_VERSION;
  builtAt: string;
  packs: PackIndexEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates a fetched index.json. Each entry's scope, profile, object list
 * and part are checked with the manifest's own rules; one bad entry
 * rejects the file. Never throws.
 */
export function parsePackIndexFile(value: unknown): PackIndexFile | null {
  if (!isRecord(value) || value.schema !== PACK_INDEX_SCHEMA_VERSION) return null;
  if (typeof value.builtAt !== 'string' || !Array.isArray(value.packs)) return null;
  const packs: PackIndexEntry[] = [];
  for (const raw of value.packs) {
    if (!isRecord(raw)) return null;
    const { packId, file, bytes, sha256, catalogVersion, profile, scope, objects, part } = raw;
    if (typeof file !== 'string' || file.length === 0 || file.includes('/') || file.includes('\\')) return null;
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0 || !isSha256(sha256)) return null;
    // The rest has the manifest's shape; reuse its parser on a stand-in manifest.
    const manifest = parsePackManifest({ schema: 1, packId, builtAt: value.builtAt, catalogVersion, profile: { audio: profile }, scope, entries: [], objects, part });
    if (!manifest) return null;
    const entry: PackIndexEntry = { packId: manifest.packId, file, bytes, sha256, catalogVersion: manifest.catalogVersion, profile: manifest.profile.audio, scope: manifest.scope, objects: manifest.objects };
    if (manifest.part) entry.part = manifest.part;
    packs.push(entry);
  }
  return { schema: PACK_INDEX_SCHEMA_VERSION, builtAt: value.builtAt, packs };
}

export interface PackChoice {
  entry: PackIndexEntry;
  delta: Delta;
}

/**
 * Which packs are worth copying to a phone: those with at least one
 * missing object, largest gain first, and each later pack's delta computed
 * as if the earlier ones were already copied (so overlapping packs are not
 * double counted).
 */
export function choosePacks(index: PackIndexEntry[], have: Iterable<string>): PackChoice[] {
  const held = new Set(have);
  const remaining = [...index];
  const chosen: PackChoice[] = [];
  while (remaining.length > 0) {
    let best: { i: number; delta: Delta } | null = null;
    for (let i = 0; i < remaining.length; i += 1) {
      const delta = computeDelta(remaining[i]!, held);
      if (delta.missing.length === 0) continue;
      if (!best || delta.missingBytes > best.delta.missingBytes) best = { i, delta };
    }
    if (!best) break;
    const [entry] = remaining.splice(best.i, 1);
    chosen.push({ entry: entry!, delta: best.delta });
    for (const sha of best.delta.missing) held.add(sha);
  }
  return chosen;
}
