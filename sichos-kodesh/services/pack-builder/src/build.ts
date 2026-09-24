import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DownloadContentTypes, DownloadTarget } from '@sichos-kodesh/app-core';
import type { ArchiveStore } from '@sichos-kodesh/archive';
import { exportObjectsIndex } from '@sichos-kodesh/archive';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { AudioProfile, PackEntry, PackKeyPair, PackManifest, PackScope } from '@sichos-kodesh/pack-format';
import {
  CATALOG_ENTRY_NAME,
  MANIFEST_ENTRY_NAME,
  OBJECTS_INDEX_ENTRY_NAME,
  PACK_EXTENSION,
  PACK_SCHEMA_VERSION,
  canonicalBytes,
  objectEntryName,
  signManifest,
  sizeSelection,
} from '@sichos-kodesh/pack-format';
import { writeStoredZip, type ZipSource } from './zip.js';

/**
 * A build is a concatenation, not an encode: the selection (catalog
 * entries x content types x audio profile) is sized against the archive's
 * objects with pack-format's `sizeSelection` - the same function the
 * download site and the phone use - and the objects already in the archive
 * are written, unchanged, into stored ZIPs with a signed manifest first.
 */

export interface BuildOptions {
  entries: CatalogEntry[];
  contentTypes: DownloadContentTypes;
  profile: AudioProfile;
  scope: PackScope;
  /** File-name stem, e.g. `5736-01-tishrei`. */
  slug: string;
  outDir: string;
  /** A part holds at most this many object bytes; a single occasion larger than that gets a part of its own. */
  maxBytes: number;
  /** Null builds an unsigned pack, which the apps accept only as loose files. */
  key: PackKeyPair | null;
  catalogVersion: string;
  /** Embed objects.json, the trust anchor for files that arrive without a manifest. */
  embedObjectsIndex: boolean;
  /** A catalog release to carry as catalog.json (the phone applies it when newer). */
  catalogRelease?: { file: string; version: string };
  /** Build even when some of the selection is not in the archive yet. */
  allowMissing: boolean;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface BuiltPack {
  file: string;
  bytes: number;
  manifest: PackManifest;
}

export interface BuildResult {
  packs: BuiltPack[];
  /** What the selection wants and the archive does not hold. */
  missing: DownloadTarget[];
  objects: number;
  objectBytes: number;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Stable for a selection: the same scope, profile and objects always give the same id. */
export function packIdFor(scope: PackScope, profile: AudioProfile, objects: Record<string, number>, part?: number): string {
  return sha256Hex(canonicalBytes({ scope, profile, objects, ...(part === undefined ? {} : { part }) }));
}

interface Part {
  entries: PackEntry[];
  objects: Record<string, number>;
  bytes: number;
}

/**
 * Greedy, in catalog order, whole occasions only: a manifest may only
 * refer to objects its own part carries, so an occasion is never cut in
 * two. An object two occasions share is carried by each part that needs it.
 */
export function splitEntries(entries: PackEntry[], maxBytes: number): Part[] {
  const parts: Part[] = [];
  let current: Part = { entries: [], objects: {}, bytes: 0 };
  const extraFor = (part: Part, entry: PackEntry): number => {
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

function describeMissing(missing: DownloadTarget[]): string {
  const sample = missing.slice(0, 5).map((t) => `${t.hebrewYear}/${t.occasionId} ${t.kind} ${t.kind === 'audio' ? t.workerFilename : t.driveFileId}`);
  return `${sample.join('; ')}${missing.length > sample.length ? `; and ${missing.length - sample.length} more` : ''}`;
}

export async function buildPacks(store: ArchiveStore, options: BuildOptions): Promise<BuildResult> {
  const log = options.log ?? (() => undefined);
  const now = options.now ?? (() => new Date());
  const index = exportObjectsIndex(store, options.catalogVersion);
  const selection = sizeSelection(options.entries, options.contentTypes, index, options.profile);
  if (selection.missing.length > 0) {
    const line = `${selection.missing.length} file(s) of the selection are not in the archive: ${describeMissing(selection.missing)}`;
    if (!options.allowMissing) throw new Error(`${line}. Crawl them first (sk-archive crawl --scope ...), or pass --allow-missing to build without them.`);
    log(`warning: ${line}`);
  }
  if (selection.entries.length === 0) throw new Error('the selection has nothing the archive holds');
  const paths = new Map<string, string>();
  for (const sha of Object.keys(selection.objects)) {
    const file = store.pathOf(sha);
    if (!file || !(await exists(file))) throw new Error(`object ${sha} is known but its bytes are missing from the archive; run sk-archive verify and crawl (or sk-pack transcode for an encoded profile)`);
    paths.set(sha, file);
  }

  const parts = splitEntries(selection.entries, options.maxBytes);
  const setId = packIdFor(options.scope, options.profile, selection.objects);
  const builtAt = now().toISOString();
  const indexBytes = options.embedObjectsIndex ? canonicalBytes(index) : null;
  const catalogBytes = options.catalogRelease ? await readFile(options.catalogRelease.file) : null;
  await mkdir(options.outDir, { recursive: true });

  const packs: BuiltPack[] = [];
  for (const [i, part] of parts.entries()) {
    const split = parts.length > 1;
    let manifest: PackManifest = {
      schema: PACK_SCHEMA_VERSION,
      packId: split ? packIdFor(options.scope, options.profile, part.objects, i) : setId,
      builtAt,
      catalogVersion: options.catalogVersion,
      profile: { audio: options.profile },
      scope: options.scope,
      entries: part.entries,
      objects: part.objects,
    };
    if (split) manifest.part = { index: i, count: parts.length, setId };
    if (indexBytes) manifest.objectsIndex = { version: options.catalogVersion, sha256: sha256Hex(indexBytes) };
    if (catalogBytes && options.catalogRelease) manifest.catalog = { version: options.catalogRelease.version, sha256: sha256Hex(catalogBytes) };
    if (options.key) manifest = signManifest(manifest, options.key);

    const sources: ZipSource[] = [{ name: MANIFEST_ENTRY_NAME, data: canonicalBytes(manifest) }];
    if (indexBytes) sources.push({ name: OBJECTS_INDEX_ENTRY_NAME, data: indexBytes });
    if (catalogBytes) sources.push({ name: CATALOG_ENTRY_NAME, data: catalogBytes });
    for (const [sha, bytes] of Object.entries(part.objects)) sources.push({ name: objectEntryName(sha), file: paths.get(sha)!, bytes });

    const name = `${options.slug}-${options.profile}${split ? `.part${i + 1}of${parts.length}` : ''}${PACK_EXTENSION}`;
    const file = path.join(options.outDir, name);
    const bytes = await writeStoredZip(file, sources);
    log(`${name}: ${part.entries.length} occasion(s), ${Object.keys(part.objects).length} object(s), ${bytes} bytes`);
    packs.push({ file, bytes, manifest });
  }
  return { packs, missing: selection.missing, objects: Object.keys(selection.objects).length, objectBytes: selection.bytes };
}
