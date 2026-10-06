import type { CatalogChangelogEntry } from './changelog.js';
import type { CatalogByYear } from './catalogLookup.js';
import { parseCatalogLibrary } from './library/parse.js';
import type { CatalogLibrary } from './library/types.js';
import type { CatalogEntry } from './types.js';
import { parseCatalogWorks } from './works/parse.js';
import type { CatalogWorks } from './works/types.js';

/**
 * What api.sk.shmuky.dev serves and what the apps consume - the contract
 * between this repo's `catalog-v…` releases (bin/release.ts writes these
 * two files) and the two apps' update code (packages/app-core's
 * catalogUpdate.ts). Both files are plain JSON with CORS open to any
 * origin; see README.md's "Catalog releases" for the paths.
 */

/** `manifest.json` - small, fetched often (once a day per device), never cached for long. */
export interface CatalogManifest {
  schemaVersion: number;
  /** The catalog release this manifest points at (CATALOG_VERSION at release time). */
  version: string;
  /** ISO 8601 timestamp of the release. */
  releasedAt: string;
  /** Absolute URL of that release's `catalog.json` - versioned, so it can be cached forever. */
  url: string;
  /** Size of `catalog.json` in bytes, so an app can decide whether to fetch it on a metered connection. */
  bytes: number;
  /** Hex SHA-256 of `catalog.json`'s bytes - verified where the platform can (the API, CI), informational elsewhere. */
  sha256: string;
  /** The Hebrew years the release covers, ascending. */
  years: number[];
  /** Number of occasions across every year. */
  occasions: number;
  /** Most recent first, at least the entry for `version`. */
  changelog: CatalogChangelogEntry[];
  /** Schema 2 and up: items per library collection. */
  collections?: Record<string, number>;
  /** Schema 3: how many works, and how many units the imported ones have. */
  works?: { works: number; units: number };
}

/** `catalog.json` - the data itself, self-describing so a file on disk can be trusted on its own. */
export interface CatalogRelease {
  schemaVersion: number;
  version: string;
  releasedAt: string;
  byYear: CatalogByYear;
}

/**
 * Schema 2 (the phone app's library): the same farbrengens, byte for byte,
 * plus the library next to them. Served under `/v2/`, while the web app
 * keeps reading schema 1 under `/v1/`.
 */
export interface LibraryRelease extends CatalogRelease {
  library: CatalogLibrary;
}

/**
 * Schema 3 (the phone app's works): schema 2 unchanged, plus the Rebbeim,
 * their seforim, and the imported works' contents and units. Served under
 * `/v3/`.
 */
export interface WorksRelease extends LibraryRelease {
  works: CatalogWorks;
}

/** Path of the schema-1 manifest under the API's origin; the catalog's own URL comes from the manifest. */
export const CATALOG_MANIFEST_PATH = '/v1/catalog/manifest.json';

/** The manifest path for a schema: `/v1/...` for the farbrengens (web), `/v2/...` with the library, `/v3/...` with the works (phone). */
export function catalogManifestPath(schemaVersion = 1): string {
  return `/v${schemaVersion}/catalog/manifest.json`;
}

/** Path template for one release's data under the API's origin - what `CatalogManifest.url` points at. */
export function catalogReleasePath(version: string, schemaVersion = 1): string {
  return `/v${schemaVersion}/catalog/${version}/catalog.json`;
}

/** The git tag a catalog release ships under: sk- first, as the repository's other tags are ChassidusHub's. */
export function catalogReleaseTag(version: string): string {
  return `sk-catalog-v${version}`;
}

/** Plain numeric semver comparison (no pre-release tags - a catalog never has them): negative when `a` is older than `b`, zero when equal, positive when newer. */
export function compareCatalogVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseVersion(version: string): number[] {
  return version.split('.').map((part) => {
    const n = Number(part);
    return Number.isFinite(n) ? n : 0;
  });
}

export function isValidCatalogVersion(version: unknown): version is string {
  return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Whether the manifest describes a release an app running `currentVersion`
 * with `schemaVersion` should fetch: strictly newer, and the same data
 * shape (an older app never applies data it cannot parse - it waits for
 * its own update, see CATALOG_SCHEMA_VERSION).
 */
export function isCatalogUpdateApplicable(manifest: Pick<CatalogManifest, 'version' | 'schemaVersion'>, currentVersion: string, schemaVersion: number): boolean {
  return manifest.schemaVersion === schemaVersion && compareCatalogVersions(manifest.version, currentVersion) > 0;
}

/** Validates a fetched manifest's shape; `null` for anything an app should not act on. The changelog is normalised rather than rejected - a missing list is an empty one. */
export function parseCatalogManifest(value: unknown): CatalogManifest | null {
  if (!isRecord(value)) return null;
  const { schemaVersion, version, releasedAt, url, bytes, sha256, years, occasions, changelog } = value;
  if (typeof schemaVersion !== 'number' || !isValidCatalogVersion(version) || typeof releasedAt !== 'string' || typeof url !== 'string') return null;
  if (!/^https?:\/\//.test(url)) return null;
  return {
    schemaVersion,
    version,
    releasedAt,
    url,
    bytes: typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0,
    sha256: typeof sha256 === 'string' ? sha256 : '',
    years: Array.isArray(years) ? years.filter((y): y is number => typeof y === 'number') : [],
    occasions: typeof occasions === 'number' ? occasions : 0,
    changelog: Array.isArray(changelog) ? changelog.filter(isChangelogEntry) : [],
    ...(isRecord(value.collections) ? { collections: Object.fromEntries(Object.entries(value.collections).filter((e): e is [string, number] => typeof e[1] === 'number')) } : {}),
    ...(isRecord(value.works) && typeof value.works.works === 'number' && typeof value.works.units === 'number' ? { works: { works: value.works.works, units: value.works.units } } : {}),
  };
}

/**
 * Validates a fetched (or stored) catalog file. Every year must be an
 * array of entries with the fields the apps read; one malformed entry
 * rejects the whole file, since a half-applied catalog is worse than the
 * bundled one. Entries are returned as-is (not copied) - the file is
 * typically a few MB.
 */
export function parseCatalogRelease(value: unknown): CatalogRelease | null {
  if (!isRecord(value)) return null;
  const { schemaVersion, version, releasedAt, byYear } = value;
  if (typeof schemaVersion !== 'number' || !isValidCatalogVersion(version) || typeof releasedAt !== 'string' || !isRecord(byYear)) return null;
  const result: CatalogByYear = {};
  for (const [key, entries] of Object.entries(byYear)) {
    const year = Number(key);
    if (!Number.isInteger(year) || !Array.isArray(entries)) return null;
    for (const entry of entries) {
      if (!isCatalogEntry(entry)) return null;
    }
    result[year] = entries as CatalogEntry[];
  }
  return { schemaVersion, version, releasedAt, byYear: result };
}

/** Validates a schema-2 file: the farbrengens as `parseCatalogRelease` checks them, and the library. */
export function parseLibraryRelease(value: unknown): LibraryRelease | null {
  const base = parseCatalogRelease(value);
  if (!base || base.schemaVersion !== 2 || !isRecord(value)) return null;
  const library = parseCatalogLibrary(value.library);
  return library ? { ...base, library } : null;
}

/** Validates a schema-3 file: schema 2's checks, and the works. */
export function parseWorksRelease(value: unknown): WorksRelease | null {
  const base = parseCatalogRelease(value);
  if (!base || base.schemaVersion !== 3 || !isRecord(value)) return null;
  const library = parseCatalogLibrary(value.library);
  const works = library ? parseCatalogWorks(value.works) : null;
  return library && works ? { ...base, library, works } : null;
}

/** Validates a catalog file of any schema - what a store reads from disk or the network. */
export function parseCatalogReleaseFile(value: unknown): CatalogRelease | LibraryRelease | WorksRelease | null {
  if (isRecord(value) && value.schemaVersion === 3) return parseWorksRelease(value);
  if (isRecord(value) && value.schemaVersion === 2) return parseLibraryRelease(value);
  return parseCatalogRelease(value);
}

export function isLibraryRelease(release: CatalogRelease | LibraryRelease): release is LibraryRelease {
  return 'library' in release && isRecord((release as LibraryRelease).library);
}

export function isWorksRelease(release: CatalogRelease | LibraryRelease | WorksRelease): release is WorksRelease {
  return isLibraryRelease(release) && 'works' in release && isRecord((release as WorksRelease).works);
}

interface ReleaseMeta {
  schemaVersion: number;
  version: string;
  releasedAt: string;
}

function releaseHead(meta: ReleaseMeta): string {
  return `{"schemaVersion":${meta.schemaVersion},"version":${JSON.stringify(meta.version)},"releasedAt":${JSON.stringify(meta.releasedAt)},"byYear":`;
}

/**
 * `catalog.json` of schema 1, from the farbrengens' JSON - exactly
 * `JSON.stringify({ schemaVersion, version, releasedAt, byYear })`, built by
 * concatenation so services/catalog-api can keep one copy of `byYear` for
 * both schemas and still serve each file byte for byte (its sha256 is in
 * the manifest).
 */
export function serializeCatalogRelease(meta: ReleaseMeta, byYearJson: string): string {
  return `${releaseHead(meta)}${byYearJson}}`;
}

/** `catalog.json` of schema 2: `JSON.stringify({ ..., byYear, library })`, sharing `byYearJson` with schema 1. */
export function serializeLibraryRelease(meta: ReleaseMeta, byYearJson: string, libraryJson: string): string {
  return `${releaseHead(meta)}${byYearJson},"library":${libraryJson}}`;
}

/** `catalog.json` of schema 3: `JSON.stringify({ ..., byYear, library, works })`, sharing the other two parts with schemas 1 and 2. */
export function serializeWorksRelease(meta: ReleaseMeta, byYearJson: string, libraryJson: string, worksJson: string): string {
  return `${releaseHead(meta)}${byYearJson},"library":${libraryJson},"works":${worksJson}}`;
}

/**
 * The fields the apps read. The display translations (`occasionLabelEn`,
 * `chapterNameHe`, catalog 1.1.0) and short titles (`occasionLabelShort`,
 * `occasionLabelShortEn`, 1.7.0) are optional - absent in older releases -
 * but must be strings when present. An app built before them never looks
 * at either, and its copy of this check (no rule for unknown fields) lets
 * a release that carries them through unchanged.
 */
function isCatalogEntry(value: unknown): value is CatalogEntry {
  if (!isRecord(value)) return false;
  const { occasionId, hebrewYear, hebrewDate, occasionLabel, occasionLabelEn, occasionLabelShort, occasionLabelShortEn, audio, pdfs } = value;
  if (typeof occasionId !== 'number' || typeof hebrewYear !== 'number' || typeof hebrewDate !== 'string' || typeof occasionLabel !== 'string') return false;
  if (!isOptionalString(occasionLabelEn) || !isOptionalString(occasionLabelShort) || !isOptionalString(occasionLabelShortEn)) return false;
  if (!Array.isArray(audio) || !Array.isArray(pdfs)) return false;
  return (
    audio.every(
      (a) => isRecord(a) && typeof a.workerFilename === 'string' && typeof a.durationMs === 'number' && isOptionalString(a.chapterName) && isOptionalString(a.chapterNameHe),
    ) && pdfs.every((p) => isRecord(p) && typeof p.section === 'string' && typeof p.label === 'string' && typeof p.driveFileId === 'string')
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isChangelogEntry(value: unknown): value is CatalogChangelogEntry {
  return isRecord(value) && isValidCatalogVersion(value.version) && typeof value.date === 'string' && Array.isArray(value.en) && Array.isArray(value.he);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
