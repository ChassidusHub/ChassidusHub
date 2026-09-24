import type { CatalogByYear, CatalogLibrary, CatalogRelease, CatalogWorkContents, CatalogWorks, CatalogWorksIndex, LibraryRelease, WorksRelease } from '@sichos-kodesh/catalog';
import { compareCatalogVersions, isLibraryRelease, isWorksRelease } from '@sichos-kodesh/catalog';

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
  /**
   * The library (schema 2) - null in an app built without one (the web).
   * The bundled library is read on first call, not at start-up; a release
   * applied later replaces it. Stable between changes, so it can back
   * `useSyncExternalStore`.
   */
  getLibrary(): CatalogLibrary | null;
  /**
   * The works (schema 3): every author and work, without units - null in an
   * app built without them. Read on first call, like the library.
   */
  getWorks(): CatalogWorksIndex | null;
  /** An imported work's contents and units, read when the work is opened; null for a work without its own. */
  getWorkContents(workId: string): CatalogWorkContents | null;
  subscribe(listener: () => void): () => void;
  /**
   * Replaces the current catalog with `release` when it is newer (same
   * schema), returning whether anything changed. Older or equal data is
   * ignored - a stale file on disk never downgrades a newer bundle. A store
   * that has a library (or works) only takes releases that carry them.
   */
  apply(release: CatalogRelease | LibraryRelease | WorksRelease, source: Exclude<CatalogSource, 'bundled'>): boolean;
  /**
   * Tells every reader to look again: for an app whose bundled library and
   * works arrive after start-up (the web loads them as a separate part of
   * its bundle), once they have.
   */
  refresh(): void;
}

/**
 * The works an app bundles: the index, and each imported work's contents,
 * both read on demand. The index is null while it is not loaded yet (the
 * web's arrives later, see `refresh`).
 */
export interface BundledWorks {
  index: () => CatalogWorksIndex | null;
  contents: (workId: string) => CatalogWorkContents | null;
}

/**
 * The one mutable catalog both apps read from: starts as the bundled
 * data, and is swapped for a newer release loaded from disk at start-up or
 * fetched from api.sk.shmuky.dev later. Every reader goes through this
 * store (a `useCatalog()` hook over `subscribe`/`get`, or `getCatalog()`
 * in code with no component), so a swap re-renders every screen with the
 * new data in place - nothing is remounted and nothing the user is doing
 * is interrupted.
 *
 * Both apps pass their bundled library as a function (`bundledLibrary`):
 * the library is several megabytes and only its own screens need it. Their
 * works (schema 3) come the same way, each work's units in a part of its
 * own. The phone reads them at once when asked; the web returns null until
 * it has fetched that part of its bundle, then calls `refresh`.
 */
export function createCatalogStore(
  bundled: CatalogByYear,
  bundledVersion: string,
  schemaVersion: number,
  bundledLibrary?: () => CatalogLibrary | null,
  bundledWorks?: BundledWorks,
): CatalogStore {
  let snapshot: CatalogSnapshot = { catalog: bundled, version: bundledVersion, releasedAt: null, source: 'bundled' };
  let appliedLibrary: CatalogLibrary | null = null;
  let loadedBundledLibrary: CatalogLibrary | null = null;
  let appliedWorks: CatalogWorks | null = null;
  let loadedBundledWorks: CatalogWorksIndex | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    get: () => snapshot,
    getCatalog: () => snapshot.catalog,
    getLibrary() {
      if (appliedLibrary) return appliedLibrary;
      if (!bundledLibrary) return null;
      loadedBundledLibrary ??= bundledLibrary();
      return loadedBundledLibrary;
    },
    getWorks() {
      if (appliedWorks) return appliedWorks;
      if (!bundledWorks) return null;
      loadedBundledWorks ??= bundledWorks.index();
      return loadedBundledWorks;
    },
    getWorkContents(workId) {
      if (appliedWorks) return appliedWorks.contents[workId] ?? null;
      return bundledWorks ? bundledWorks.contents(workId) : null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    apply(release, source) {
      if (release.schemaVersion !== schemaVersion) return false;
      const library = isLibraryRelease(release) ? release.library : null;
      const works = isWorksRelease(release) ? release.works : null;
      if (bundledLibrary && !library) return false;
      if (bundledWorks && !works) return false;
      if (compareCatalogVersions(release.version, snapshot.version) <= 0) return false;
      snapshot = { catalog: release.byYear, version: release.version, releasedAt: release.releasedAt, source };
      if (library) appliedLibrary = library;
      if (works) appliedWorks = works;
      notify();
      return true;
    },
    refresh: notify,
  };
}
