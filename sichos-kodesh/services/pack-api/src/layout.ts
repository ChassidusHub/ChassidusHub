import type { AudioProfile, ObjectsIndex, PackEntry, PackIndexFile, PackableLibraryCollection, WorksShelf } from '@sichos-kodesh/pack-format';
import { AUDIO_PROFILES, isPackableLibraryCollection, isSha256, parseObjectsIndex } from '@sichos-kodesh/pack-format';
import type { CatalogEntry, LibraryCollection, LibraryItemBase } from '@sichos-kodesh/catalog';

/**
 * The published archive: what `sk-pack publish` writes to a directory and
 * `rclone sync` puts in R2, and all the pack API reads. Sharded by year so
 * a build reads a few hundred KB of index, not the whole archive's.
 *
 *   meta.json                what is published: catalog version, years, profiles, objects.json's stamp
 *   catalog/<year>.json      the catalog's farbrengens of that year (CatalogEntry[])
 *   index/<year>.json        the objects that year's farbrengens refer to: an ObjectsIndex subset + CRC-32s
 *   library/<collection>.json   a library collection as the catalog has it: its items and browse axes
 *   index/library-<collection>.json   the objects its items refer to, the same shape as a year's
 *   works/shelf.json         the seforim that can join a pack, bundled by author (pack-format's works.ts)
 *   works/<id>.json          a sefer's entries, as its own text pack carries them
 *   index/works.json         the seforim's objects (texts, search indexes), the same shape as a year's
 *   objects.json             the whole objects index, canonical bytes - embedded in every pack
 *   objects/<sha256>         the objects themselves
 *   packs/index.json         the prebuilt packs (pack-format's PackIndexFile)
 *   packs/<file>.skpack      the prebuilt packs themselves
 */

export const PUBLISH_SCHEMA = 1 as const;

export interface PublishMeta {
  schema: typeof PUBLISH_SCHEMA;
  catalogVersion: string;
  publishedAt: string;
  years: number[];
  /** Audio profiles the archive holds objects for. */
  profiles: AudioProfile[];
  objectsIndex: { sha256: string; bytes: number; crc32: number };
  objects: number;
  bytes: number;
  /** Library collections with at least one object published (pack-format's library.ts). Absent before the library was. */
  library?: PackableLibraryCollection[];
  /** How many seforim can join a pack (works/shelf.json). Absent when none. */
  works?: number;
  /**
   * What a person can take, each file once: a recording counts once
   * whatever its qualities, and `bytes` is everything in its original
   * quality. `objects` and `bytes` above count every encoding. Absent from
   * an older publish.
   */
  files?: PublishedFiles;
}

export interface PublishedFiles {
  audio: number;
  pdf: number;
  text: number;
  bytes: number;
}

export interface YearShard {
  index: ObjectsIndex;
  /** sha256 -> CRC-32 of the object, for the ZIP's local headers. */
  crc32: Record<string, number>;
}

export const publishKeys = {
  meta: 'meta.json',
  catalogYear: (year: number) => `catalog/${year}.json`,
  yearShard: (year: number) => `index/${year}.json`,
  libraryCollection: (collection: PackableLibraryCollection) => `library/${collection}.json`,
  libraryShard: (collection: PackableLibraryCollection) => `index/library-${collection}.json`,
  worksShelf: 'works/shelf.json',
  workEntries: (id: string) => `works/${id}.json`,
  /** A sefer's parts: each part id's item ids (`<work>/<unit>`), for a pack that takes some of it. */
  workParts: (id: string) => `works/${id}.parts.json`,
  worksShard: 'index/works.json',
  objectsIndex: 'objects.json',
  object: (sha256: string) => `objects/${sha256}`,
  packsIndex: 'packs/index.json',
  pack: (file: string) => `packs/${file}`,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parsePublishMeta(value: unknown): PublishMeta | null {
  if (!isRecord(value) || value.schema !== PUBLISH_SCHEMA) return null;
  const { catalogVersion, publishedAt, years, profiles, objectsIndex, objects, bytes, library, works, files } = value;
  if (typeof catalogVersion !== 'string' || typeof publishedAt !== 'string') return null;
  if (!Array.isArray(years) || !years.every((y) => Number.isInteger(y))) return null;
  if (!Array.isArray(profiles) || !profiles.every((p) => (AUDIO_PROFILES as readonly unknown[]).includes(p))) return null;
  if (!isRecord(objectsIndex) || !isSha256(objectsIndex.sha256) || typeof objectsIndex.bytes !== 'number' || typeof objectsIndex.crc32 !== 'number') return null;
  if (typeof objects !== 'number' || typeof bytes !== 'number') return null;
  if (library !== undefined && (!Array.isArray(library) || !library.every((c) => typeof c === 'string' && isPackableLibraryCollection(c)))) return null;
  if (works !== undefined && (typeof works !== 'number' || !Number.isInteger(works) || works < 0)) return null;
  const count = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (files !== undefined && (!isRecord(files) || !count(files.audio) || !count(files.pdf) || !count(files.text) || !count(files.bytes))) return null;
  return {
    schema: PUBLISH_SCHEMA,
    catalogVersion,
    publishedAt,
    years: years as number[],
    profiles: profiles as AudioProfile[],
    objectsIndex: { sha256: objectsIndex.sha256, bytes: objectsIndex.bytes, crc32: objectsIndex.crc32 },
    objects,
    bytes,
    ...(library ? { library: library as PackableLibraryCollection[] } : {}),
    ...(works ? { works } : {}),
    ...(files ? { files: { audio: files.audio as number, pdf: files.pdf as number, text: files.text as number, bytes: files.bytes as number } } : {}),
  };
}

export function parseYearShard(value: unknown): YearShard | null {
  if (!isRecord(value) || !isRecord(value.crc32)) return null;
  const index = parseObjectsIndex(value.index);
  if (!index) return null;
  const crc32: Record<string, number> = {};
  for (const [sha, crc] of Object.entries(value.crc32)) {
    if (!isSha256(sha) || typeof crc !== 'number') return null;
    crc32[sha] = crc;
  }
  return { index, crc32 };
}

export function parseCatalogYear(value: unknown): CatalogEntry[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((entry) => isRecord(entry) && typeof entry.occasionId === 'number' && typeof entry.hebrewDate === 'string' && Array.isArray(entry.audio) && Array.isArray(entry.pdfs))
    ? (value as CatalogEntry[])
    : null;
}

/** A published library collection: items with ids, labels and refs, and its browse axes. */
export function parseLibraryCollection(value: unknown): LibraryCollection<LibraryItemBase> | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.groups)) return null;
  if (!value.items.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.label === 'string' && Array.isArray(item.refs))) return null;
  for (const groups of Object.values(value.groups)) {
    if (!Array.isArray(groups) || !groups.every((g) => isRecord(g) && typeof g.slug === 'string' && typeof g.name === 'string' && Array.isArray(g.itemIds))) return null;
  }
  return value as unknown as LibraryCollection<LibraryItemBase>;
}

export function parseWorksShelf(value: unknown): WorksShelf | null {
  if (!isRecord(value) || !Array.isArray(value.bundles) || !Array.isArray(value.works)) return null;
  if (!value.bundles.every((b) => isRecord(b) && typeof b.id === 'string' && isRecord(b.label) && Array.isArray(b.works) && typeof b.bytes === 'number')) return null;
  if (!value.works.every((w) => isRecord(w) && typeof w.id === 'string' && isRecord(w.title) && typeof w.bundle === 'string' && typeof w.bytes === 'number')) return null;
  return value as unknown as WorksShelf;
}

/** A sefer's published entries: works entries, each with refs that carry a hash and a size. */
export function parseWorkEntries(value: unknown): PackEntry[] | null {
  if (!Array.isArray(value)) return null;
  const ok = value.every(
    (entry) =>
      isRecord(entry) &&
      entry.collection === 'works' &&
      typeof entry.itemId === 'string' &&
      Array.isArray(entry.refs) &&
      entry.refs.every((ref) => isRecord(ref) && isSha256(ref.sha256) && typeof ref.bytes === 'number' && typeof ref.kind === 'string' && typeof ref.sourceId === 'string'),
  );
  return ok ? (value as PackEntry[]) : null;
}

/** A sefer's parts file: part id -> the item ids of its texts. */
export function parseWorkParts(value: unknown): Record<string, string[]> | null {
  if (!isRecord(value)) return null;
  return Object.values(value).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string')) ? (value as Record<string, string[]>) : null;
}

export type { PackIndexFile };
