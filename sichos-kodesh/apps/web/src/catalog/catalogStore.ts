import { useEffect, useSyncExternalStore } from 'react';
import { CATALOG_VERSION, CATALOG_WORKS_SCHEMA_VERSION } from '@sichos-kodesh/catalog';
import type { CatalogByYear, CatalogLibrary, CatalogWorkContents, CatalogWorksIndex } from '@sichos-kodesh/catalog';
import { createCatalogStore } from '@sichos-kodesh/app-core';
import type { CatalogSnapshot } from '@sichos-kodesh/app-core';
import { bundledParts, loadBundledLibrary, loadBundledWorkContents, loadBundledWorks } from './bundledParts';
import bundledCatalog from './data';

/**
 * The one catalog the whole app reads (see app-core's createCatalogStore):
 * the bundled data until a newer release is loaded from Cache Storage at
 * start-up (main.tsx) or fetched from api.sk.shmuky.dev (catalogUpdater.ts).
 * Components read it through `useCatalog()` so a swap re-renders them in
 * place; code with no component (the retention pruner, the download
 * provider's own lookups) calls `getCatalog()` at the moment it needs it -
 * never at module scope, which would freeze the bundled copy.
 *
 * Catalog schema 3, like the phone: the farbrengens, the library (schema
 * 2's collections, moadim and parshiyos) and the works. The bundled
 * library and works are parts of the bundle of their own, fetched the
 * first time a screen asks for them (`useLibrary`, `useWorks`,
 * `useWorkContents`), so the farbrengens load no slower than before.
 */
export const catalogStore = createCatalogStore(bundledCatalog, CATALOG_VERSION, CATALOG_WORKS_SCHEMA_VERSION, bundledParts.library, {
  index: bundledParts.works,
  contents: bundledParts.contents,
});

export function getCatalog(): CatalogByYear {
  return catalogStore.getCatalog();
}

export function useCatalog(): CatalogByYear {
  return useSyncExternalStore(catalogStore.subscribe, catalogStore.getCatalog, catalogStore.getCatalog);
}

/** The catalog plus where it came from and which release it is - for the About screen. */
export function useCatalogInfo(): CatalogSnapshot {
  return useSyncExternalStore(catalogStore.subscribe, catalogStore.get, catalogStore.get);
}

const getLibrary = () => catalogStore.getLibrary();
const getWorks = () => catalogStore.getWorks();

/** The library, or null while its part of the bundle is on its way (it is fetched on first use). */
export function useLibrary(): CatalogLibrary | null {
  const library = useSyncExternalStore(catalogStore.subscribe, getLibrary, getLibrary);
  useEffect(() => {
    if (!library) loadBundledLibrary().then(() => catalogStore.refresh(), () => undefined);
  }, [library]);
  return library;
}

/** Every author and work, or null while its part of the bundle is on its way. */
export function useWorks(): CatalogWorksIndex | null {
  const works = useSyncExternalStore(catalogStore.subscribe, getWorks, getWorks);
  useEffect(() => {
    if (!works) loadBundledWorks().then(() => catalogStore.refresh(), () => undefined);
  }, [works]);
  return works;
}

/**
 * A sefer's contents and chapters: undefined while they are on their way,
 * null for a work that has none of its own (its text is only linked).
 */
export function useWorkContents(workId: string, hasUnits: boolean): CatalogWorkContents | null | undefined {
  const read = () => catalogStore.getWorkContents(workId);
  const contents = useSyncExternalStore(catalogStore.subscribe, read, read);
  useEffect(() => {
    if (hasUnits && !contents) loadBundledWorkContents(workId).then(() => catalogStore.refresh(), () => undefined);
  }, [contents, hasUnits, workId]);
  if (!hasUnits) return null;
  return contents ?? undefined;
}

/** Every sefer's chapters, fetched once (for searching their names); resolves when all are in the store. */
export async function loadAllWorkContents(works: CatalogWorksIndex): Promise<void> {
  await Promise.all(works.works.filter((work) => work.units).map((work) => loadBundledWorkContents(work.id)));
  catalogStore.refresh();
}
