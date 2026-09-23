import type { CatalogChangelogEntry } from './changelog.js';
import type { CatalogByYear } from './catalogLookup.js';
import type { CatalogEntry } from './types.js';

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
}

/** `catalog.json` - the data itself, self-describing so a file on disk can be trusted on its own. */
export interface CatalogRelease {
  schemaVersion: number;
  version: string;
  releasedAt: string;
  byYear: CatalogByYear;
}

/** Path of the manifest under the API's origin; the catalog's own URL comes from the manifest. */
export const CATALOG_MANIFEST_PATH = '/v1/catalog/manifest.json';

/** Path template for one release's data under the API's origin - what `CatalogManifest.url` points at. */
export function catalogReleasePath(version: string): string {
  return `/v1/catalog/${version}/catalog.json`;
}

/** The git tag a catalog release ships under. */
export function catalogReleaseTag(version: string): string {
  return `catalog-v${version}`;
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

function isCatalogEntry(value: unknown): value is CatalogEntry {
  if (!isRecord(value)) return false;
  const { occasionId, hebrewYear, hebrewDate, occasionLabel, audio, pdfs } = value;
  if (typeof occasionId !== 'number' || typeof hebrewYear !== 'number' || typeof hebrewDate !== 'string' || typeof occasionLabel !== 'string') return false;
  if (!Array.isArray(audio) || !Array.isArray(pdfs)) return false;
  return (
    audio.every((a) => isRecord(a) && typeof a.workerFilename === 'string' && typeof a.durationMs === 'number') &&
    pdfs.every((p) => isRecord(p) && typeof p.section === 'string' && typeof p.label === 'string' && typeof p.driveFileId === 'string')
  );
}

function isChangelogEntry(value: unknown): value is CatalogChangelogEntry {
  return isRecord(value) && isValidCatalogVersion(value.version) && typeof value.date === 'string' && Array.isArray(value.en) && Array.isArray(value.he);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
