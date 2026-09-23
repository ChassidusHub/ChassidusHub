import { parseCatalogRelease } from '@sichos-kodesh/catalog';
import type { CatalogRelease } from '@sichos-kodesh/catalog';

/**
 * Where a fetched catalog release lives between visits: its own Cache
 * Storage bucket (a few MB of JSON is too big for localStorage, and Cache
 * Storage is what this app already uses for every other offline file).
 * The key is a synthetic same-origin URL - nothing ever requests it over
 * the network, and the service worker's routes never match it, so this
 * is purely a key/value slot. One entry only: the newest release replaces
 * the previous one.
 */
const CATALOG_CACHE_NAME = 'catalog-release-v1';
const CATALOG_CACHE_KEY = '/__catalog/catalog.json';

export async function readStoredCatalog(): Promise<CatalogRelease | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(CATALOG_CACHE_NAME);
    const response = await cache.match(CATALOG_CACHE_KEY);
    if (!response) return null;
    return parseCatalogRelease(await response.json());
  } catch {
    return null;
  }
}

export async function writeStoredCatalog(release: CatalogRelease): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(CATALOG_CACHE_NAME);
    await cache.put(CATALOG_CACHE_KEY, new Response(JSON.stringify(release), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // Best-effort persistence only - the release still applies for this session.
  }
}
