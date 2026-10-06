import type { CatalogLibrary, CatalogShelf, CatalogWorkContents, CatalogWorksIndex, LibraryCollections, OccasionGroup } from '@sichos-kodesh/catalog';

/**
 * The library and the works this build bundles, as parts of the bundle of
 * their own: several megabytes the farbrengens never need, so each is
 * fetched the first time a screen asks for it (catalogStore.ts) and cached
 * by the service worker like the rest of the app.
 *
 * The files are the phone's - apps/mobile/src/catalog/data/library and
 * works, written by packages/catalog and packages/works - read here as
 * they are rather than written twice. `import.meta.glob` makes each file
 * its own lazily loaded part, typed `unknown`, so the compiler never reads
 * megabytes of JSON.
 */
const LIBRARY_FILES = import.meta.glob<unknown>('../../../mobile/src/catalog/data/library/*.json', { import: 'default' });
const WORKS_FILES = import.meta.glob<unknown>('../../../mobile/src/catalog/data/works/works.json', { import: 'default' });
const CONTENTS_FILES = import.meta.glob<unknown>('../../../mobile/src/catalog/data/works/contents/*.json', { import: 'default' });
const SHELF_FILES = import.meta.glob<unknown>('../../../mobile/src/catalog/data/works/shelf.json', { import: 'default' });

function loader(files: Record<string, () => Promise<unknown>>, name: string): () => Promise<unknown> {
  const key = Object.keys(files).find((path) => path.endsWith(`/${name}.json`));
  if (!key) throw new Error(`catalog: no bundled ${name}.json`);
  return files[key]!;
}

let library: CatalogLibrary | null = null;
let works: CatalogWorksIndex | null = null;
let shelf: CatalogShelf | null = null;
const contents = new Map<string, CatalogWorkContents>();

/** What the store reads: null until each part has arrived. */
export const bundledParts = {
  library: (): CatalogLibrary | null => library,
  works: (): CatalogWorksIndex | null => works,
  contents: (workId: string): CatalogWorkContents | null => contents.get(workId) ?? null,
  shelf: (): CatalogShelf | null => shelf,
};

let libraryLoad: Promise<void> | null = null;
let worksLoad: Promise<void> | null = null;
let shelfLoad: Promise<void> | null = null;
const contentsLoads = new Map<string, Promise<void>>();

/** Fetches the library's parts once; a failed fetch (offline before they were ever cached) is tried again on the next call. */
export function loadBundledLibrary(): Promise<void> {
  libraryLoad ??= (async () => {
    const collection = <K extends keyof LibraryCollections>(name: K) => loader(LIBRARY_FILES, name)() as Promise<LibraryCollections[K]>;
    const [meta, likkuteiSichos, maamorim, yomanim, hadranim, michtavimKlolim, reshimos, jemEvents] = await Promise.all([
      loader(LIBRARY_FILES, 'meta')() as Promise<{ moadim: OccasionGroup[]; parshiyos: OccasionGroup[] }>,
      collection('likkuteiSichos'),
      collection('maamorim'),
      collection('yomanim'),
      collection('hadranim'),
      collection('michtavimKlolim'),
      collection('reshimos'),
      collection('jemEvents'),
    ]);
    library = { moadim: meta.moadim, parshiyos: meta.parshiyos, collections: { likkuteiSichos, maamorim, yomanim, hadranim, michtavimKlolim, reshimos, jemEvents } };
  })().catch((error: unknown) => {
    libraryLoad = null;
    throw error;
  });
  return libraryLoad;
}

export function loadBundledWorks(): Promise<void> {
  worksLoad ??= (loader(WORKS_FILES, 'works')() as Promise<CatalogWorksIndex>)
    .then((index) => {
      works = index;
    })
    .catch((error: unknown) => {
      worksLoad = null;
      throw error;
    });
  return worksLoad;
}

/** A work's contents and chapters; a work with none bundled resolves with nothing (the store then says null). */
export function loadBundledWorkContents(workId: string): Promise<void> {
  const key = Object.keys(CONTENTS_FILES).find((path) => path.endsWith(`/${workId}.json`));
  if (!key) return Promise.resolve();
  let load = contentsLoads.get(workId);
  if (!load) {
    load = (CONTENTS_FILES[key]!() as Promise<CatalogWorkContents>)
      .then((value) => {
        contents.set(workId, value);
      })
      .catch((error: unknown) => {
        contentsLoads.delete(workId);
        throw error;
      });
    contentsLoads.set(workId, load);
  }
  return load;
}

/** The HebrewBooks shelf, fetched once; a build without one resolves with nothing (the store then says null). */
export function loadBundledShelf(): Promise<void> {
  if (Object.keys(SHELF_FILES).length === 0) return Promise.resolve();
  shelfLoad ??= (loader(SHELF_FILES, 'shelf')() as Promise<CatalogShelf>)
    .then((value) => {
      shelf = value;
    })
    .catch((error: unknown) => {
      shelfLoad = null;
      throw error;
    });
  return shelfLoad;
}
