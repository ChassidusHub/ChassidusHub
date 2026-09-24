import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CatalogLibrary, LibraryCollectionId } from '@sichos-kodesh/catalog';
import { LIBRARY_COLLECTION_IDS, SHIPPABLE_COLLECTIONS, parseCatalogLibrary, parseCatalogWorks, worksRightsProblems } from '@sichos-kodesh/catalog';
import type { ImportedWork } from '../src/index.js';
import type { HebrewBooksShelf } from '@sichos-kodesh/hebrewbooks-index';
import { AUTHORS, CHABADLIBRARY_TREE, HEBREWBOOKS_ONLY, HEBREWBOOKS_SERIES, WORKS, buildCatalogWorks, collectionUnits, editionUrl, libraryUnits, mayShip, placeShelf, rightsFor, workById, workForCollection } from '../src/index.js';

/** The library the phone bundles (apps/mobile/src/catalog/data/library): the real item ids. */
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'mobile', 'src', 'catalog', 'data', 'library');
const read = (file: string) => JSON.parse(readFileSync(path.join(dataDir, file), 'utf8')) as unknown;
const meta = read('meta.json') as Pick<CatalogLibrary, 'moadim' | 'parshiyos'>;
const library = parseCatalogLibrary({ ...meta, collections: Object.fromEntries(LIBRARY_COLLECTION_IDS.map((id) => [id, read(`${id}.json`)])) })!;

describe('the registry', () => {
  it('names every work chabadlibrary.org lists, once, under a known author', () => {
    const libraryWorks = CHABADLIBRARY_TREE.filter((node) => node.parent !== 0);
    expect(libraryWorks).toHaveLength(73);
    const sourced = WORKS.filter((work) => work.sources.some((s) => s.source === 'chabadlibrary'));
    expect(sourced.map((w) => w.sources.find((s) => s.source === 'chabadlibrary')!.sourceId).sort()).toEqual(libraryWorks.map((n) => String(n.id)).sort());
    const authorIds = new Set(AUTHORS.map((a) => a.id));
    for (const work of WORKS) for (const author of work.authors) expect(authorIds.has(author)).toBe(true);
  });

  it('has unique ids, both titles, and the Rebbeim in order', () => {
    const ids = WORKS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const work of WORKS) {
      expect(work.title.he.length).toBeGreaterThan(0);
      expect(work.title.en.length).toBeGreaterThan(0);
      expect(work.title.he).not.toContain('"');
    }
    expect(AUTHORS.filter((a) => a.rebbe).map((a) => a.rebbe)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(workById('tanya')!.authors).toEqual(['alter-rebbe']);
    expect(workById('likkutei-sichos')!.authors).toEqual(['the-rebbe']);
  });

  it('gives every library collection exactly one work, the gated ones included', () => {
    for (const collection of [...LIBRARY_COLLECTION_IDS, 'igros', 'maanos'] as const) {
      expect(WORKS.filter((w) => w.collection === collection)).toHaveLength(1);
    }
    expect(workForCollection('likkuteiSichos').id).toBe('likkutei-sichos');
    expect(workForCollection('maamorim').id).toBe('sefer-hamaamarim-melukat');
  });
});

describe('the seven collections as units', () => {
  it('keeps every item id, in order, under its collection\'s work', () => {
    for (const collection of LIBRARY_COLLECTION_IDS) {
      const units = collectionUnits(library, collection);
      const items = library.collections[collection].items;
      expect(units.map((u) => u.id)).toEqual(items.map((i) => i.id));
      expect(new Set(units.map((u) => u.workId))).toEqual(new Set([workForCollection(collection).id]));
    }
    const all = libraryUnits(library);
    expect([...all.values()].reduce((n, units) => n + units.length, 0)).toBe(LIBRARY_COLLECTION_IDS.reduce((n, c) => n + library.collections[c].items.length, 0));
  });

  it('carries each item\'s files as editions the apps already ship', () => {
    const units = collectionUnits(library, 'jemEvents');
    const withAudio = units.find((u) => u.editions.some((e) => e.kind === 'audio'))!;
    expect(withAudio.editions.every((e) => e.source === 'jem' || e.source === 'mafteiach')).toBe(true);
    for (const unit of units.slice(0, 50)) for (const e of unit.editions) expect(mayShip(e)).toBe(true);
    const maamar = collectionUnits(library, 'maamorim').find((u) => u.occasionIds)!;
    expect(maamar.occasionIds!.length).toBeGreaterThan(0);
  });
});

describe('the rights gate', () => {
  it('reads each licence, and each source decision overrides only towards stricter', () => {
    expect(rightsFor({ source: 'sefaria', licence: 'cc-by-nc' })).toBe('ship-with-credit');
    expect(rightsFor({ source: 'sefaria', licence: 'cc0' })).toBe('ship');
    expect(rightsFor({ source: 'sefaria', licence: 'public-domain' })).toBe('ship');
    expect(rightsFor({ source: 'sefaria', licence: 'unknown' })).toBe('link-only');
    expect(rightsFor({ source: 'chabadlibrary', licence: 'free-to-read' })).toBe('link-only');
    expect(rightsFor({ source: 'chabadlibrary', licence: 'cc0' })).toBe('link-only');
    expect(rightsFor({ source: 'hebrewbooks', licence: 'site-terms' })).toBe('link-only');
    // The Igros app's copies go by their collection: the Igros ship with credit, the Maanos and anything unnamed stay local.
    expect(rightsFor({ source: 'igros-app', sourceId: 'igros', licence: 'commercial' })).toBe('ship-with-credit');
    expect(rightsFor({ source: 'igros-app', sourceId: 'igros:3275', licence: 'commercial' })).toBe('ship-with-credit');
    expect(rightsFor({ source: 'igros-app', sourceId: 'maanos', licence: 'commercial' })).toBe('local-only');
    expect(rightsFor({ source: 'igros-app', sourceId: 'maanos:5742:4', licence: 'commercial' })).toBe('local-only');
    expect(rightsFor({ source: 'igros-app', licence: 'commercial' })).toBe('local-only');
    expect(rightsFor({ source: 'mafteiach', licence: 'facts-and-links' })).toBe('ship');
  });

  it('agrees with the catalog\'s per-collection table', () => {
    for (const [collection, shippable] of Object.entries(SHIPPABLE_COLLECTIONS)) {
      if (collection === 'farbrengens') continue;
      const work = workForCollection(collection as LibraryCollectionId | 'igros' | 'maanos');
      const own = work.sources.filter((s) => s.source === 'mafteiach' || s.source === 'jem' || s.source === 'igros-app');
      expect(own.length).toBeGreaterThan(0);
      expect(own.every(mayShip)).toBe(shippable);
    }
  });

  it('ships Kehot\'s Tanya with credit and keeps Neirot\'s Hebrew as a link', () => {
    const tanya = workById('tanya')!.sources.filter((s) => s.source === 'sefaria');
    expect(tanya.every(mayShip)).toBe(true);
    expect(tanya.filter((s) => s.licence === 'cc-by-nc').every((s) => s.credit === 'Kehot Publication Society')).toBe(true);
    const gate = workById('ner-mitzvah-vetorah-or')!.sources.filter((s) => s.source === 'sefaria');
    expect(gate.filter(mayShip).map((s) => s.language)).toEqual(['en']);
  });
});

describe('the works as catalog schema 3 carries them', () => {
  const KEHOT = 'Kehot Publication Society';
  const torahOr: ImportedWork = {
    workId: 'torah-or',
    source: 'sefaria',
    contents: [{ title: { he: 'נח', en: 'Noach' }, entries: [{ unitId: 'noach/1' }] }, { title: { he: 'מראי מקומות', en: 'Sources and References' }, entries: [{ unitId: 'sources-and-references/noach/1' }] }],
    units: [
      {
        id: 'noach/1',
        workId: 'torah-or',
        label: 'נח, פרק א׳',
        labelEn: 'Noach, Chapter 1',
        editions: [
          { source: 'sefaria', sourceId: 'Torah Ohr, Noach 1', kind: 'text', licence: 'cc-by-nc', language: 'he', version: KEHOT, credit: KEHOT, text: { sha256: 'a'.repeat(64), bytes: 10 } },
          { source: 'sefaria', sourceId: 'Torah Ohr, Noach 1', kind: 'text', licence: 'cc0', language: 'en', version: 'Sefaria Community Translation', text: { sha256: 'b'.repeat(64), bytes: 5 } },
        ],
      },
      {
        id: 'sources-and-references/noach/1',
        workId: 'torah-or',
        label: 'מראי מקומות, נח, דף א׳',
        editions: [{ source: 'sefaria', sourceId: 'Sources and References on Torah Ohr, Noach 1', kind: 'text', licence: 'cc-by-nc', language: 'he', version: KEHOT, credit: KEHOT, text: { sha256: 'c'.repeat(64), bytes: 7 } }],
      },
    ],
  };

  it('carries every work with its rights, points each edition at its own title, and validates', () => {
    const works = buildCatalogWorks([torahOr]);
    expect(parseCatalogWorks(works)).not.toBeNull();
    expect(worksRightsProblems(works)).toEqual([]);
    const work = works.works.find((w) => w.id === 'torah-or')!;
    expect(work).toMatchObject({ units: 2, textBytes: 22 });
    const [first, second] = works.contents['torah-or']!.units;
    expect(work.sources[first!.editions[0]!.source]).toMatchObject({ sourceId: 'Torah Ohr', language: 'he', rights: 'ship-with-credit' });
    expect(work.sources[first!.editions[1]!.source]).toMatchObject({ language: 'en', rights: 'ship' });
    // The companion's edition goes to its own title, not the main one with the same version.
    expect(work.sources[second!.editions[0]!.source]!.sourceId).toBe('Sources and References on Torah Ohr');
    expect(first!.ref).toBe('Torah Ohr, Noach 1');
  });

  it('never carries a local-only source nor a gated collection, and keeps the shippable ones', () => {
    const works = buildCatalogWorks([]);
    for (const work of works.works) for (const source of work.sources) expect(source.rights).not.toBe('local-only');
    expect(works.works.some((w) => w.collection === 'maanos')).toBe(false);
    const igros = works.works.find((w) => w.id === 'igros-kodesh-rebbe')!;
    expect(igros.collection).toBe('igros');
    expect(igros.sources.find((s) => s.source === 'igros-app')).toMatchObject({ sourceId: 'igros', language: 'he', rights: 'ship-with-credit', credit: 'Kehot Publication Society' });
    expect(works.works.find((w) => w.id === 'likkutei-sichos')!.collection).toBe('likkuteiSichos');
    expect(works.authors.map((a) => a.id)).toEqual(AUTHORS.map((a) => a.id));
    expect(() => buildCatalogWorks([{ ...torahOr, workId: 'no-such-work' }])).toThrow(/no-such-work/);
  });

  it('links an edition to its page on Sefaria', () => {
    expect(editionUrl({ source: 'sefaria', sourceId: 'Tanya, Part I; Likkutei Amarim 1', language: 'en', version: 'Sefaria Community Translation' })).toBe(
      'https://www.sefaria.org/Tanya,_Part_I%3B_Likkutei_Amarim_1?ven=Sefaria_Community_Translation&lang=en',
    );
    expect(editionUrl({ source: 'jem', sourceId: 'x.mp3' })).toBeNull();
  });
});

describe('the HebrewBooks shelf', () => {
  // A shelf in hebrewbooks-index's shape; the series keys are its own.
  const scan = (id: number, volume?: string) => ({ id, title: `x ${id}`, ...(volume ? { volume } : {}), pages: 100 });
  const shelf: HebrewBooksShelf = {
    catalogVersion: '9',
    authors: [
      {
        authorId: 'the-rebbe',
        series: [
          { key: 'לקוטי שיחות', title: 'לקוטי שיחות', scans: [scan(14924, 'א'), scan(14925, 'ב')] },
          { key: 'שיחות קודש', title: 'שיחות קודש', scans: [scan(20001, 'תש״י')] },
          { key: 'שערי המועדים', title: 'שערי המועדים', scans: [scan(30001)] },
        ],
      },
      { authorId: 'alter-rebbe', series: [{ key: 'לקוטי אמרים תניא', title: 'לקוטי אמרים תניא', scans: [scan(43319)] }] },
      // Toras Menachem's name for Likkutei Sichos, under another author: never placed.
      { authorId: 'frierdiker-rebbe', series: [{ key: 'לקוטי שיחות', title: 'לקוטי שיחות', scans: [scan(90000)] }] },
      { authorId: null, series: [{ key: 'קובץ', title: 'קובץ', scans: [scan(26000)] }] },
    ],
  };

  it('places a series with its sefer by title or by the registry\'s other names, only under the same author', () => {
    const placed = placeShelf(shelf, WORKS);
    expect(placed.byWork.get('likkutei-sichos')!.map((s) => s.scans.length)).toEqual([2]);
    expect(placed.byWork.get('tanya')!.map((s) => s.title)).toEqual(['לקוטי אמרים תניא']);
    expect(placed.byWork.get('sichos-kodesh')!.map((s) => s.title)).toEqual(['שיחות קודש']);
    const frierdiker = placed.shelf.authors.find((a) => a.authorId === 'frierdiker-rebbe')!;
    expect(frierdiker.series[0]!.workId).toBeUndefined();
    expect(placed.shelf.authors.find((a) => a.authorId === 'the-rebbe')!.series[2]!.workId).toBeUndefined();
    // The shelf's own matching keys stay behind.
    expect(JSON.stringify(placed.shelf)).not.toContain('"key"');
  });

  it('gives a sefer with scans a HebrewBooks source, link-only, and keeps a HebrewBooks-only sefer only when it has scans', () => {
    const without = buildCatalogWorks([]);
    expect(without.works.some((w) => w.id === 'sichos-kodesh')).toBe(false);
    expect(without).not.toHaveProperty('shelf');
    const withShelf = buildCatalogWorks([], shelf);
    const sichosKodesh = withShelf.works.find((w) => w.id === 'sichos-kodesh')!;
    expect(sichosKodesh.sources).toEqual([{ source: 'hebrewbooks', sourceId: 'שיחות קודש', kind: 'scan', language: 'he', licence: 'site-terms', rights: 'link-only' }]);
    expect(withShelf.works.find((w) => w.id === 'tanya')!.sources.at(-1)).toMatchObject({ source: 'hebrewbooks', rights: 'link-only' });
    expect(withShelf.works.some((w) => w.id === 'sefer-hasichos-rebbe')).toBe(false);
    expect(parseCatalogWorks(withShelf)?.shelf?.authors).toHaveLength(4);
    expect(worksRightsProblems(withShelf)).toEqual([]);
  });

  it('names only series the real shelf has', () => {
    for (const [workId, names] of Object.entries(HEBREWBOOKS_SERIES)) {
      expect(workById(workId), workId).toBeDefined();
      expect(names.length).toBeGreaterThan(0);
    }
    expect(HEBREWBOOKS_ONLY.every((work) => work.authors.length > 0 && work.sources.length === 0)).toBe(true);
  });
});
