import type { AudioProfile, ObjectsIndex, PackIndexFile } from '@sichos-kodesh/pack-format';
import { AUDIO_PROFILES, isSha256, parseObjectsIndex } from '@sichos-kodesh/pack-format';
import type { CatalogEntry } from '@sichos-kodesh/catalog';

/**
 * The published archive: what `sk-pack publish` writes to a directory and
 * `rclone sync` puts in R2, and all the pack API reads. Sharded by year so
 * a build reads a few hundred KB of index, not the whole archive's.
 *
 *   meta.json                what is published: catalog version, years, profiles, objects.json's stamp
 *   catalog/<year>.json      the catalog's farbrengens of that year (CatalogEntry[])
 *   index/<year>.json        the objects that year's farbrengens refer to: an ObjectsIndex subset + CRC-32s
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
  const { catalogVersion, publishedAt, years, profiles, objectsIndex, objects, bytes } = value;
  if (typeof catalogVersion !== 'string' || typeof publishedAt !== 'string') return null;
  if (!Array.isArray(years) || !years.every((y) => Number.isInteger(y))) return null;
  if (!Array.isArray(profiles) || !profiles.every((p) => (AUDIO_PROFILES as readonly unknown[]).includes(p))) return null;
  if (!isRecord(objectsIndex) || !isSha256(objectsIndex.sha256) || typeof objectsIndex.bytes !== 'number' || typeof objectsIndex.crc32 !== 'number') return null;
  if (typeof objects !== 'number' || typeof bytes !== 'number') return null;
  return {
    schema: PUBLISH_SCHEMA,
    catalogVersion,
    publishedAt,
    years: years as number[],
    profiles: profiles as AudioProfile[],
    objectsIndex: { sha256: objectsIndex.sha256, bytes: objectsIndex.bytes, crc32: objectsIndex.crc32 },
    objects,
    bytes,
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

export type { PackIndexFile };
