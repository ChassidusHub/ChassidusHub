import type { CatalogByYear, CatalogRelease } from '@sichos-kodesh/catalog';
import { compareCatalogVersions } from '@sichos-kodesh/catalog';

/** Where the catalog an app is currently showing came from. */
export type CatalogSource = 'bundled' | 'stored' | 'fetched';

export interface CatalogSnapshot {
  catalog: CatalogByYear;
  /** CATALOG_VERSION of the data in `catalog` - the bundled one, or the release that replaced it. */
  version: string;
  releasedAt: string | null;
  source: CatalogSource;
}

export interface CatalogStore {
  get(): CatalogSnapshot;
  getCatalog(): CatalogByYear;
  subscribe(listener: () => void): () => void;
  /**
   * Replaces the current catalog with `release` when it is newer (same
   * schema), returning whether anything changed. Older or equal data is
   * ignored - a stale file on disk never downgrades a newer bundle.
   */
  apply(release: CatalogRelease, source: Exclude<CatalogSource, 'bundled'>): boolean;
}

/**
 * The one mutable catalog both apps read from: starts as the bundled
 * data, and is swapped for a newer release loaded from disk at start-up or
 * fetched from api.sk.shmuky.dev later. Every reader goes through this
 * store (a `useCatalog()` hook over `subscribe`/`get`, or `getCatalog()`
 * in code with no component), so a swap re-renders every screen with the
 * new data in place - nothing is remounted and nothing the user is doing
 * is interrupted.
 */
export function createCatalogStore(bundled: CatalogByYear, bundledVersion: string, schemaVersion: number): CatalogStore {
  let snapshot: CatalogSnapshot = { catalog: bundled, version: bundledVersion, releasedAt: null, source: 'bundled' };
  const listeners = new Set<() => void>();

  return {
    get: () => snapshot,
    getCatalog: () => snapshot.catalog,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    apply(release, source) {
      if (release.schemaVersion !== schemaVersion) return false;
      if (compareCatalogVersions(release.version, snapshot.version) <= 0) return false;
      snapshot = { catalog: release.byYear, version: release.version, releasedAt: release.releasedAt, source };
      for (const listener of listeners) listener();
      return true;
    },
  };
}
