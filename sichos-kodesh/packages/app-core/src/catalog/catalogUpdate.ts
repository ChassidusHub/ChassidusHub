import { CATALOG_MANIFEST_PATH, isCatalogUpdateApplicable, parseCatalogManifest, parseCatalogRelease } from '@sichos-kodesh/catalog';
import type { CatalogManifest, CatalogRelease } from '@sichos-kodesh/catalog';

/** The origin the apps fetch catalog releases from - see packages/catalog/src/release.ts for what it serves. */
export const CATALOG_API_BASE_URL = 'https://api.sk.shmuky.dev';

export function catalogManifestUrl(baseUrl: string = CATALOG_API_BASE_URL): string {
  return `${baseUrl.replace(/\/$/, '')}${CATALOG_MANIFEST_PATH}`;
}

/** How often an app checks the manifest on its own (a manual "Update catalog" tap always checks). */
export const CATALOG_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface CatalogCheckRecord {
  /** Epoch ms of the last completed check (whatever its outcome), or null before the first. */
  checkedAt: number | null;
  /** The app version that ran that check - an app update always checks again right away ("when the app updates, the catalog updates too"). */
  appVersion: string | null;
}

/** Whether the silent, automatic check should run now: never before the first, again after an app update, otherwise once per interval. */
export function shouldCheckCatalog(record: CatalogCheckRecord, appVersion: string, now: number = Date.now()): boolean {
  if (record.checkedAt == null) return true;
  if (record.appVersion !== appVersion) return true;
  return now - record.checkedAt >= CATALOG_CHECK_INTERVAL_MS;
}

export type FetchLike = (url: string, init?: { cache?: 'no-store' }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type CatalogUpdateCheck = { status: 'up-to-date'; manifest: CatalogManifest | null } | { status: 'available'; manifest: CatalogManifest } | { status: 'error'; error: string };

/**
 * Asks the API whether a newer catalog exists for an app running
 * `currentVersion`. Never throws - an unreachable API (offline, the API
 * not deployed yet) is an ordinary 'error' result the caller shows or
 * ignores, not something that can break start-up.
 */
export async function checkCatalogUpdate(options: { manifestUrl?: string; currentVersion: string; schemaVersion: number; fetchFn?: FetchLike }): Promise<CatalogUpdateCheck> {
  const { manifestUrl = catalogManifestUrl(), currentVersion, schemaVersion, fetchFn = fetch as FetchLike } = options;
  let manifest: CatalogManifest | null;
  try {
    const response = await fetchFn(manifestUrl, { cache: 'no-store' });
    if (!response.ok) return { status: 'error', error: `manifest: HTTP ${response.status}` };
    manifest = parseCatalogManifest(await response.json());
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
  if (!manifest) return { status: 'error', error: 'manifest: unrecognised shape' };
  return isCatalogUpdateApplicable(manifest, currentVersion, schemaVersion) ? { status: 'available', manifest } : { status: 'up-to-date', manifest };
}

/**
 * Downloads the release the manifest points at and validates it - the
 * version inside the file must be the one the manifest promised, so a
 * stale CDN copy or a mislabelled upload is rejected rather than applied.
 * Throws on any failure; callers turn that into their own error state.
 */
export async function fetchCatalogRelease(manifest: CatalogManifest, fetchFn: FetchLike = fetch as FetchLike): Promise<CatalogRelease> {
  const response = await fetchFn(manifest.url);
  if (!response.ok) throw new Error(`catalog: HTTP ${response.status}`);
  const release = parseCatalogRelease(await response.json());
  if (!release) throw new Error('catalog: unrecognised shape');
  if (release.version !== manifest.version) throw new Error(`catalog: file is ${release.version}, manifest promised ${manifest.version}`);
  if (release.schemaVersion !== manifest.schemaVersion) throw new Error('catalog: schema mismatch');
  return release;
}
