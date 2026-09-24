import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CatalogLibrary, LibraryCollectionId } from '@sichos-kodesh/catalog';
import { LIBRARY_COLLECTION_IDS, SHIPPABLE_COLLECTIONS, parseCatalogLibrary, parseCatalogWorks, worksRightsProblems } from '@sichos-kodesh/catalog';
import type { ImportedWork } from '../src/index.js';
import { AUTHORS, CHABADLIBRARY_TREE, WORKS, buildCatalogWorks, collectionUnits, editionUrl, libraryUnits, mayShip, rightsFor, workById, workForCollection } from '../src/index.js';

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
    expect(works.works.some((w) => w.collection === 'igros' || w.collection === 'maanos')).toBe(false);
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
