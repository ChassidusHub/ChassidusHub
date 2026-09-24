import { useSyncExternalStore } from 'react';
import { CATALOG_LIBRARY_SCHEMA_VERSION, CATALOG_VERSION } from '@sichos-kodesh/catalog';
import type { CatalogByYear, CatalogLibrary } from '@sichos-kodesh/catalog';
import { createCatalogStore } from '@sichos-kodesh/app-core';
import type { CatalogSnapshot } from '@sichos-kodesh/app-core';
import bundledCatalog from './data';
import bundledLibrary from './data/library';

/**
 * The one catalog the whole app reads (see app-core's createCatalogStore):
 * the bundled data until a newer release is loaded from the app's own
 * files at start-up (App.tsx, and the headless background task) or fetched
 * from api.sk.shmuky.dev (catalogUpdater.ts - "Update catalog" in Settings,
 * plus a silent daily check). Same shape as the web's catalogStore.ts:
 * components read it through `useCatalog()` so a swap re-renders them in
 * place; code with no component calls `getCatalog()` at the moment it
 * needs it - never at module scope, which would freeze the bundled copy.
 *
 * The phone runs on catalog schema 2 (the web on 1): the same farbrengens
 * plus the library - Likkutei Sichos, maamorim, yomanim, hadranim,
 * michtavim, reshimos, JEM events, and mafteiach's moadim and parshiyos.
 * The bundled library is read on the first `getLibrary()`, not at start-up.
 */
export const catalogStore = createCatalogStore(bundledCatalog, CATALOG_VERSION, CATALOG_LIBRARY_SCHEMA_VERSION, bundledLibrary);

export function getCatalog(): CatalogByYear {
  return catalogStore.getCatalog();
}

export function useCatalog(): CatalogByYear {
  return useSyncExternalStore(catalogStore.subscribe, catalogStore.getCatalog, catalogStore.getCatalog);
}

/** The library (never null on the phone). Read it where it is needed, not at module scope. */
export function getLibrary(): CatalogLibrary {
  return catalogStore.getLibrary()!;
}

export function useLibrary(): CatalogLibrary {
  return useSyncExternalStore(catalogStore.subscribe, getLibrary, getLibrary);
}

/** The catalog plus where it came from and which release it is - for Settings and About. */
export function useCatalogInfo(): CatalogSnapshot {
  return useSyncExternalStore(catalogStore.subscribe, catalogStore.get, catalogStore.get);
}
