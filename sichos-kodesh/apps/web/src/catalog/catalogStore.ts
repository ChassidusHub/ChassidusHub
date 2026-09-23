import { useSyncExternalStore } from 'react';
import { CATALOG_SCHEMA_VERSION, CATALOG_VERSION } from '@sichos-kodesh/catalog';
import type { CatalogByYear } from '@sichos-kodesh/catalog';
import { createCatalogStore } from '@sichos-kodesh/app-core';
import type { CatalogSnapshot } from '@sichos-kodesh/app-core';
import bundledCatalog from './data';

/**
 * The one catalog the whole app reads (see app-core's createCatalogStore):
 * the bundled data until a newer release is loaded from Cache Storage at
 * start-up (main.tsx) or fetched from api.sk.shmuky.dev (catalogUpdater.ts).
 * Components read it through `useCatalog()` so a swap re-renders them in
 * place; code with no component (the retention pruner, the download
 * provider's own lookups) calls `getCatalog()` at the moment it needs it -
 * never at module scope, which would freeze the bundled copy.
 */
export const catalogStore = createCatalogStore(bundledCatalog, CATALOG_VERSION, CATALOG_SCHEMA_VERSION);

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
