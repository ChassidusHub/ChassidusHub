import { createReadStream } from 'node:fs';
import { copyFile, link, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import type { ArchiveStore } from '@sichos-kodesh/archive';
import { exportObjectsIndex } from '@sichos-kodesh/archive';
import type { CatalogEntry, LibraryCollection, LibraryItemBase } from '@sichos-kodesh/catalog';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@sichos-kodesh/app-core';
import type { AudioProfile, ObjectsIndex, PackableLibraryCollection } from '@sichos-kodesh/pack-format';
import { AUDIO_PROFILES, PACKABLE_LIBRARY_COLLECTIONS, PACK_EXTENSION, buildSourceLookup, canonicalBytes, sourceKey } from '@sichos-kodesh/pack-format';
import type { PublishMeta, YearShard } from '@sichos-kodesh/pack-api';
import { PUBLISH_SCHEMA, publishKeys } from '@sichos-kodesh/pack-api';

/**
 * `sk-pack publish`: the archive as the pack API reads it (see
 * services/pack-api/src/layout.ts), written to a directory that `rclone
 * sync` then mirrors to R2. Objects are hard-linked from the archive when
 * the directory is on the same disk, copied otherwise; CRC-32s are
 * computed once and cached in `.crc-cache.json`, so a re-publish after a
 * crawl only reads the new objects. Objects `sk-pack mirror --prune` sent
 * to R2 and dropped from this disk are listed in `.mirrored.json`; they stay
 * in the index on their cached CRC-32 without their bytes.
 */

export interface PublishOptions {
  /** The catalog's farbrengens by year: the builder's catalog year files. */
  years: Map<number, CatalogEntry[]>;
  /** The library's collections as the catalog has them (apps/mobile/src/catalog/data/library): published once the archive holds any of their files. */
  library?: Partial<Record<PackableLibraryCollection, LibraryCollection<LibraryItemBase>>>;
  catalogVersion: string;
  outDir: string;
  /** A directory of built packs (and their index.json) to publish too. */
  packsDir?: string;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface PublishResult {
  meta: PublishMeta;
  linked: number;
  copied: number;
  skipped: number;
  /** Objects already in the mirror whose bytes are no longer on this disk. */
  mirrored: number;
}

const CRC_CACHE = '.crc-cache.json';
/** The share of the originals a smaller profile must cover to be listed in meta.json. */
export const PROFILE_COVERAGE = 0.9;
/**
 * The share of its files the archive must hold for a year or a library
 * collection to be listed. Hanachos are shared between years and
 * collections, so one year's crawl brings a few files of many others;
 * those wait until their own crawl.
 */
export const SCOPE_COVERAGE = 0.5;

/** How many of these (kind, source id) files the index has an original of. */
function heldShare(files: Array<{ kind: 'audio' | 'pdf'; sourceId: string }>, lookup: Map<string, string>): number {
  const wanted = new Set(files.map((file) => sourceKey(file.kind, file.sourceId)));
  if (wanted.size === 0) return 0;
  let held = 0;
  for (const key of wanted) if (lookup.has(key)) held += 1;
  return held / wanted.size;
}
export const MIRRORED_LIST = '.mirrored.json';

/** The objects `sk-pack mirror --prune` moved off this disk, by hash. */
export async function readMirrored(outDir: string): Promise<Set<string>> {
  try {
    return new Set(JSON.parse(await readFile(path.join(outDir, MIRRORED_LIST), 'utf8')) as string[]);
  } catch {
    return new Set();
  }
}

async function fileCrc(file: string): Promise<number> {
  let crc = 0;
  for await (const chunk of createReadStream(file)) crc = crc32(chunk as Buffer, crc);
  return crc >>> 0;
}

async function sizeOf(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size;
  } catch {
    return null;
  }
}

async function writeAtomic(file: string, data: Uint8Array | string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

/** The shas a year's farbrengens refer to, in any profile the index holds. */
export function yearShard(entries: CatalogEntry[], index: ObjectsIndex, crcs: Map<string, number>): YearShard {
  const lookup = buildSourceLookup(index);
  const shard: YearShard = { index: { schema: index.schema, version: index.version, builtAt: index.builtAt, objects: {} }, crc32: {} };
  for (const target of listDownloadTargets(entries, ALL_CONTENT_TYPES)) {
    const sourceId = target.kind === 'audio' ? target.workerFilename : target.driveFileId;
    if (!sourceId) continue;
    const profiles: Array<AudioProfile | undefined> = target.kind === 'audio' ? [...AUDIO_PROFILES] : [undefined];
    for (const profile of profiles) {
      const sha = lookup.get(sourceKey(target.kind, sourceId, profile));
      if (!sha || shard.index.objects[sha]) continue;
      shard.index.objects[sha] = index.objects[sha]!;
      const crc = crcs.get(sha);
      if (crc === undefined) throw new Error(`no CRC-32 for ${sha}`);
      shard.crc32[sha] = crc;
    }
  }
  return shard;
}

/** The same for a library collection: every PDF and recording its items list. */
export function libraryShard(items: LibraryItemBase[], index: ObjectsIndex, crcs: Map<string, number>): YearShard {
  const lookup = buildSourceLookup(index);
  const shard: YearShard = { index: { schema: index.schema, version: index.version, builtAt: index.builtAt, objects: {} }, crc32: {} };
  for (const item of items) {
    for (const ref of item.refs) {
      if (ref.kind !== 'audio' && ref.kind !== 'pdf') continue;
      const profiles: Array<AudioProfile | undefined> = ref.kind === 'audio' ? [...AUDIO_PROFILES] : [undefined];
      for (const profile of profiles) {
        const sha = lookup.get(sourceKey(ref.kind, ref.sourceId, profile));
        if (!sha || shard.index.objects[sha]) continue;
        shard.index.objects[sha] = index.objects[sha]!;
        const crc = crcs.get(sha);
        if (crc === undefined) throw new Error(`no CRC-32 for ${sha}`);
        shard.crc32[sha] = crc;
      }
    }
  }
  return shard;
}

export async function publishArchive(store: ArchiveStore, options: PublishOptions): Promise<PublishResult> {
  const log = options.log ?? (() => undefined);
  const now = options.now ?? (() => new Date());
  const out = options.outDir;
  await mkdir(out, { recursive: true });

  const index = exportObjectsIndex(store, options.catalogVersion);
  const indexBytes = canonicalBytes(index);
  await writeAtomic(path.join(out, publishKeys.objectsIndex), indexBytes);

  // CRC-32s, cached by hash: a hash always names the same bytes.
  const cacheFile = path.join(out, CRC_CACHE);
  const crcs = new Map<string, number>();
  try {
    for (const [sha, crc] of Object.entries(JSON.parse(await readFile(cacheFile, 'utf8')) as Record<string, number>)) crcs.set(sha, crc);
  } catch {
    // First publish.
  }

  const mirroredList = await readMirrored(out);
  let linked = 0;
  let copied = 0;
  let skipped = 0;
  let mirrored = 0;
  await mkdir(path.join(out, 'objects'), { recursive: true });
  for (const [sha, entry] of Object.entries(index.objects)) {
    const source = store.pathOf(sha);
    if (!source) throw new Error(`object ${sha} is in the index but not in the archive`);
    const target = path.join(out, publishKeys.object(sha));
    if ((await sizeOf(target)) === entry.bytes && crcs.has(sha)) {
      skipped += 1;
      continue;
    }
    if (mirroredList.has(sha) && crcs.has(sha) && (await sizeOf(source)) === null) {
      mirrored += 1;
      continue;
    }
    if (!crcs.has(sha)) crcs.set(sha, await fileCrc(source));
    if ((await sizeOf(target)) === entry.bytes) {
      skipped += 1;
      continue;
    }
    try {
      await link(source, target);
      linked += 1;
    } catch {
      await copyFile(source, target);
      copied += 1;
    }
  }
  await writeAtomic(cacheFile, JSON.stringify(Object.fromEntries(crcs)));

  const years: number[] = [];
  const perProfile = new Map<AudioProfile, number>();
  for (const entry of Object.values(index.objects)) {
    if (entry.kind === 'audio') perProfile.set(entry.profile ?? 'src', (perProfile.get(entry.profile ?? 'src') ?? 0) + 1);
  }
  // A profile is offered once it covers (nearly) every recording: a trial encode of one month is not a choice for the whole archive.
  const originals = perProfile.get('src') ?? 0;
  const profiles = new Set([...perProfile].filter(([profile, count]) => profile === 'src' || count >= PROFILE_COVERAGE * originals).map(([profile]) => profile));
  const lookup = buildSourceLookup(index);
  for (const [year, entries] of [...options.years.entries()].sort(([a], [b]) => a - b)) {
    const files = listDownloadTargets(entries, ALL_CONTENT_TYPES).flatMap((target) => {
      const sourceId = target.kind === 'audio' ? target.workerFilename : target.driveFileId;
      return sourceId ? [{ kind: target.kind, sourceId }] : [];
    });
    if (heldShare(files, lookup) < SCOPE_COVERAGE) continue;
    const shard = yearShard(entries, index, crcs);
    years.push(year);
    await writeAtomic(path.join(out, publishKeys.catalogYear(year)), JSON.stringify(entries));
    await writeAtomic(path.join(out, publishKeys.yearShard(year)), JSON.stringify(shard));
  }

  const library: PackableLibraryCollection[] = [];
  for (const collection of PACKABLE_LIBRARY_COLLECTIONS) {
    const data = options.library?.[collection];
    if (!data) continue;
    const files = data.items.flatMap((item) => item.refs.flatMap((ref) => (ref.kind === 'audio' || ref.kind === 'pdf' ? [{ kind: ref.kind, sourceId: ref.sourceId }] : [])));
    if (heldShare(files, lookup) < SCOPE_COVERAGE) continue;
    const shard = libraryShard(data.items, index, crcs);
    library.push(collection);
    await writeAtomic(path.join(out, publishKeys.libraryCollection(collection)), JSON.stringify(data));
    await writeAtomic(path.join(out, publishKeys.libraryShard(collection)), JSON.stringify(shard));
  }

  if (options.packsDir) {
    await mkdir(path.join(out, 'packs'), { recursive: true });
    for (const name of await readdir(options.packsDir)) {
      if (!name.endsWith(PACK_EXTENSION) && name !== 'index.json') continue;
      await copyFile(path.join(options.packsDir, name), path.join(out, 'packs', name));
    }
  }

  const meta: PublishMeta = {
    schema: PUBLISH_SCHEMA,
    catalogVersion: options.catalogVersion,
    publishedAt: now().toISOString(),
    years,
    profiles: AUDIO_PROFILES.filter((profile) => profiles.has(profile)),
    objectsIndex: { sha256: createHash('sha256').update(indexBytes).digest('hex'), bytes: indexBytes.length, crc32: crc32(Buffer.from(indexBytes)) >>> 0 },
    objects: Object.keys(index.objects).length,
    bytes: Object.values(index.objects).reduce((sum, entry) => sum + entry.bytes, 0),
    ...(library.length > 0 ? { library } : {}),
  };
  await writeAtomic(path.join(out, publishKeys.meta), `${JSON.stringify(meta, null, 2)}\n`);
  log(
    `published ${meta.objects} object(s) (${linked} linked, ${copied} copied, ${skipped} already there, ${mirrored} only in the mirror), ${years.length} year(s)${library.length ? `, library: ${library.join(', ')}` : ''}, to ${out}`,
  );
  return { meta, linked, copied, skipped, mirrored };
}
