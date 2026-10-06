import { useSyncExternalStore } from 'react';
import { CATALOG_VERSION, CATALOG_WORKS_SCHEMA_VERSION } from '@sichos-kodesh/catalog';
import type { CatalogByYear, CatalogLibrary, CatalogShelf, CatalogWorkContents, CatalogWorksIndex } from '@sichos-kodesh/catalog';
import { createCatalogStore } from '@sichos-kodesh/app-core';
import type { CatalogSnapshot } from '@sichos-kodesh/app-core';
import bundledCatalog from './data';
import bundledLibrary from './data/library';
import bundledWorks, { bundledShelf, bundledWorkContents } from './data/works';

/**
 * The one catalog the whole app reads (see app-core's createCatalogStore):
 * the bundled data until a newer release is loaded from the app's own
 * files at start-up (App.tsx, and the headless background task) or fetched
 * from api.sk.chassidushub.org (catalogUpdater.ts - "Update catalog" in Settings,
 * plus a silent daily check). Same shape as the web's catalogStore.ts:
 * components read it through `useCatalog()` so a swap re-renders them in
 * place; code with no component calls `getCatalog()` at the moment it
 * needs it - never at module scope, which would freeze the bundled copy.
 *
 * The phone runs on catalog schema 3 (the web on 1): the same farbrengens,
 * plus the library - Likkutei Sichos, maamorim, yomanim, hadranim,
 * michtavim, reshimos, JEM events, and mafteiach's moadim and parshiyos -
 * plus the works: the Rebbeim, their seforim, and the imported seforim's
 * chapters. The bundled library and works are read on first use, not at
 * start-up, and each sefer's chapters only when it is opened.
 */
export const catalogStore = createCatalogStore(bundledCatalog, CATALOG_VERSION, CATALOG_WORKS_SCHEMA_VERSION, bundledLibrary, {
  index: bundledWorks,
  contents: bundledWorkContents,
  shelf: bundledShelf,
});

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

/** Every author and work (never null on the phone). Read it where it is needed, not at module scope. */
export function getWorks(): CatalogWorksIndex {
  return catalogStore.getWorks()!;
}

export function useWorks(): CatalogWorksIndex {
  return useSyncExternalStore(catalogStore.subscribe, getWorks, getWorks);
}

/** A sefer's contents and chapters, for the works imported with their own; null for the rest. */
export function getWorkContents(workId: string): CatalogWorkContents | null {
  return catalogStore.getWorkContents(workId);
}

/** The HebrewBooks shelf, read the first time a screen asks for it. */
export function useShelf(): CatalogShelf | null {
  return useSyncExternalStore(catalogStore.subscribe, catalogStore.getShelf, catalogStore.getShelf);
}
