import { describe, expect, it } from 'vitest';
import { CATALOG_CHANGELOG } from '../src/changelog.js';
import {
  catalogManifestPath,
  catalogReleasePath,
  catalogReleaseTag,
  compareCatalogVersions,
  isCatalogUpdateApplicable,
  parseCatalogManifest,
  parseCatalogRelease,
  parseCatalogReleaseFile,
  parseLibraryRelease,
  parseWorksRelease,
  serializeCatalogRelease,
  serializeLibraryRelease,
  serializeWorksRelease,
} from '../src/release.js';
import { catalogUnit, unitsInOrder, worksByAuthor } from '../src/works/lookup.js';
import { parseCatalogWorks, worksRightsProblems } from '../src/works/parse.js';
import type { CatalogWorks } from '../src/works/types.js';
import { CATALOG_SCHEMA_VERSION, CATALOG_VERSION } from '../src/version.js';

const manifest = {
  schemaVersion: 1,
  version: '1.2.0',
  releasedAt: '2026-10-01T00:00:00.000Z',
  url: 'https://api.sk.shmuky.dev/v1/catalog/1.2.0/catalog.json',
  bytes: 2_000_000,
  sha256: 'ab'.repeat(32),
  years: [5710, 5711],
  occasions: 2,
  changelog: [{ version: '1.2.0', date: '2026-10-01', en: ['x'], he: ['y'] }],
};

const entry = { occasionId: 1, hebrewYear: 5711, hebrewDate: '5711-01-09', occasionLabel: 'x', audio: [{ workerFilename: 'a.mp3', durationMs: 1 }], pdfs: [] };

describe('catalog versioning', () => {
  it("keeps the package's own version and its changelog in step", () => {
    expect(CATALOG_CHANGELOG[0]?.version).toBe(CATALOG_VERSION);
    expect(CATALOG_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('compares versions numerically, not as strings', () => {
    expect(compareCatalogVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareCatalogVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareCatalogVersions('0.9.9', '1.0.0')).toBeLessThan(0);
  });

  it('names the tag and the data path from the version', () => {
    expect(catalogReleaseTag('1.2.0')).toBe('catalog-v1.2.0');
    expect(catalogReleasePath('1.2.0')).toBe('/v1/catalog/1.2.0/catalog.json');
  });
});

describe('isCatalogUpdateApplicable', () => {
  it('wants a strictly newer release of the same schema', () => {
    expect(isCatalogUpdateApplicable(manifest, '1.1.0', 1)).toBe(true);
    expect(isCatalogUpdateApplicable(manifest, '1.2.0', 1)).toBe(false);
    expect(isCatalogUpdateApplicable(manifest, '1.3.0', 1)).toBe(false);
  });

  it('never applies data of another schema version, however new', () => {
    expect(isCatalogUpdateApplicable({ ...manifest, schemaVersion: 2 }, '1.0.0', CATALOG_SCHEMA_VERSION)).toBe(false);
  });
});

describe('parseCatalogManifest', () => {
  it('accepts a well-formed manifest as-is', () => {
    expect(parseCatalogManifest(manifest)).toEqual(manifest);
  });

  it('rejects a manifest missing what the update needs', () => {
    expect(parseCatalogManifest(null)).toBeNull();
    expect(parseCatalogManifest({ ...manifest, version: 'latest' })).toBeNull();
    expect(parseCatalogManifest({ ...manifest, url: '/relative' })).toBeNull();
    expect(parseCatalogManifest({ ...manifest, schemaVersion: '1' })).toBeNull();
  });

  it('normalises the optional parts rather than rejecting them', () => {
    const parsed = parseCatalogManifest({ schemaVersion: 1, version: '1.0.1', releasedAt: 'x', url: 'https://a/b' });
    expect(parsed).toMatchObject({ bytes: 0, sha256: '', years: [], occasions: 0, changelog: [] });
  });
});

describe('parseCatalogRelease', () => {
  it('accepts a release and keys its years as numbers', () => {
    const parsed = parseCatalogRelease({ schemaVersion: 1, version: '1.0.1', releasedAt: 'x', byYear: { '5711': [entry] } });
    expect(parsed?.byYear[5711]).toEqual([entry]);
  });

  it('rejects the whole file on one malformed entry', () => {
    expect(parseCatalogRelease({ schemaVersion: 1, version: '1.0.1', releasedAt: 'x', byYear: { '5711': [entry, { occasionId: 'no' }] } })).toBeNull();
    expect(parseCatalogRelease({ schemaVersion: 1, version: '1.0.1', releasedAt: 'x', byYear: { abc: [] } })).toBeNull();
    expect(parseCatalogRelease({ schemaVersion: 1, version: '1.0.1', releasedAt: 'x', byYear: [] })).toBeNull();
  });

  it('accepts the display translations (catalog 1.1.0), as strings, and entries without them', () => {
    const release = { schemaVersion: 1, version: '1.1.0', releasedAt: 'x', byYear: { '5711': [translatedEntry, entry] } };
    expect(parseCatalogRelease(release)?.byYear[5711]).toEqual([translatedEntry, entry]);
    const badLabel = { ...translatedEntry, occasionLabelEn: 5 };
    const badChapter = { ...translatedEntry, audio: [{ workerFilename: 'a.mp3', durationMs: 1, chapterNameHe: null }] };
    expect(parseCatalogRelease({ ...release, byYear: { '5711': [badLabel] } })).toBeNull();
    expect(parseCatalogRelease({ ...release, byYear: { '5711': [badChapter] } })).toBeNull();
  });

  it('serves the translations to apps built before them: their entry check (catalog 1.0.0) lets a 1.1.0 release through', () => {
    // Frozen copy of the entry check an installed app runs (packages/catalog/src/release.ts as of catalog 1.0.0).
    function isCatalogEntry1_0_0(value: unknown): boolean {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
      const { occasionId, hebrewYear, hebrewDate, occasionLabel, audio, pdfs } = value as Record<string, unknown>;
      if (typeof occasionId !== 'number' || typeof hebrewYear !== 'number' || typeof hebrewDate !== 'string' || typeof occasionLabel !== 'string') return false;
      if (!Array.isArray(audio) || !Array.isArray(pdfs)) return false;
      return (
        audio.every((a) => typeof a === 'object' && a !== null && typeof a.workerFilename === 'string' && typeof a.durationMs === 'number') &&
        pdfs.every((p) => typeof p === 'object' && p !== null && typeof p.section === 'string' && typeof p.label === 'string' && typeof p.driveFileId === 'string')
      );
    }
    const wire = JSON.parse(serializeCatalogRelease({ schemaVersion: 1, version: '1.1.0', releasedAt: 'x' }, JSON.stringify({ 5711: [translatedEntry] })));
    expect(wire.byYear['5711'].every(isCatalogEntry1_0_0)).toBe(true);
    // The fields an old app reads are all there, unchanged - the Hebrew label it keys progress by included.
    expect(wire.byYear['5711'][0]).toMatchObject({ occasionId: 1, hebrewYear: 5711, hebrewDate: '5711-01-09', occasionLabel: `ו' תשרי`, pdfs: [] });
    expect(wire.byYear['5711'][0].audio[0]).toMatchObject({ workerFilename: 'a.mp3', durationMs: 1, chapterName: 'Sicha 1' });
  });
});

const translatedEntry = {
  ...entry,
  occasionLabel: `ו' תשרי`,
  occasionLabelEn: '6 Tishrei',
  audio: [{ workerFilename: 'a.mp3', durationMs: 1, chapterName: 'Sicha 1', chapterNameHe: 'שיחה א׳' }],
};

const collection = (items: unknown[] = []) => ({ items, groups: {} });
const library = {
  moadim: [{ slug: '10_shvat', name: 'יו"ד שבט', occasionIds: [1] }],
  parshiyos: [],
  collections: {
    likkuteiSichos: collection([{ id: '1:4', label: 'ח"א ע\' 4', refs: [{ kind: 'pdf', sourceId: 'LS4', role: 'sicha' }], volume: 1, page: 4 }]),
    maamorim: collection(),
    yomanim: collection(),
    hadranim: collection(),
    michtavimKlolim: collection(),
    reshimos: collection(),
    jemEvents: collection(),
  },
};

describe('schema 2 (the library)', () => {
  const meta = { schemaVersion: 2, version: '1.0.1', releasedAt: '2026-10-01T00:00:00.000Z' };

  it('has its own manifest and data paths', () => {
    expect(catalogManifestPath()).toBe('/v1/catalog/manifest.json');
    expect(catalogManifestPath(2)).toBe('/v2/catalog/manifest.json');
    expect(catalogReleasePath('1.2.0', 2)).toBe('/v2/catalog/1.2.0/catalog.json');
  });

  it('parses a release with the farbrengens and the library, and dispatches on the schema', () => {
    const file = { ...meta, byYear: { '5711': [entry] }, library };
    const parsed = parseLibraryRelease(file);
    expect(parsed?.library.moadim[0]?.occasionIds).toEqual([1]);
    expect(parsed?.byYear[5711]).toEqual([entry]);
    expect(parseCatalogReleaseFile(file)).toEqual(parsed);
    expect(parseCatalogReleaseFile({ ...file, schemaVersion: 1 })).not.toHaveProperty('library');
  });

  it('rejects a schema-2 file without a valid library - a web-shaped file never passes as a library', () => {
    expect(parseLibraryRelease({ ...meta, byYear: {} })).toBeNull();
    expect(parseLibraryRelease({ ...meta, byYear: {}, library: { ...library, collections: { ...library.collections, jemEvents: undefined } } })).toBeNull();
    const badRef = { ...library, collections: { ...library.collections, maamorim: collection([{ id: '1', label: 'x', refs: [{ kind: 'pdf' }] }]) } };
    expect(parseLibraryRelease({ ...meta, byYear: {}, library: badRef })).toBeNull();
    expect(parseLibraryRelease({ ...meta, schemaVersion: 1, byYear: {}, library })).toBeNull();
  });

  it('serializes both schemas byte for byte like JSON.stringify, sharing the farbrengens', () => {
    const byYear = { 5711: [entry] };
    const byYearJson = JSON.stringify(byYear);
    const v1 = { ...meta, schemaVersion: 1 };
    expect(serializeCatalogRelease(v1, byYearJson)).toBe(JSON.stringify({ ...v1, byYear }));
    expect(serializeLibraryRelease(meta, byYearJson, JSON.stringify(library))).toBe(JSON.stringify({ ...meta, byYear, library }));
  });

  it('keeps the collection counts of a schema-2 manifest', () => {
    expect(parseCatalogManifest({ ...manifest, schemaVersion: 2, collections: { maamorim: 1568, bad: 'x' } })?.collections).toEqual({ maamorim: 1568 });
  });
});

describe('schema 3 (the works)', () => {
  const meta = { schemaVersion: 3, version: '1.3.0', releasedAt: '2026-10-01T00:00:00.000Z' };
  const works: CatalogWorks = {
    authors: [{ id: 'alter-rebbe', name: { he: 'אדמו״ר הזקן', en: 'The Alter Rebbe' }, rebbe: 1 }],
    works: [
      {
        id: 'tanya',
        title: { he: 'תניא', en: 'Tanya' },
        authors: ['alter-rebbe'],
        genre: 'chassidus',
        levels: ['part', 'chapter'],
        sources: [
          { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'he', licence: 'cc-by-nc', rights: 'ship-with-credit', credit: 'Kehot', version: 'Kehot' },
          { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'en', licence: 'unknown', rights: 'link-only', version: 'Other' },
        ],
        units: 2,
        textBytes: 20,
      },
      { id: 'likkutei-sichos', title: { he: 'לקוטי שיחות', en: 'Likkutei Sichos' }, authors: ['the-rebbe'], genre: 'sichos', levels: ['volume'], collection: 'likkuteiSichos', sources: [] },
    ],
    contents: {
      tanya: {
        workId: 'tanya',
        contents: [{ title: { he: 'ליקוטי אמרים', en: 'Likkutei Amarim' }, entries: [{ unitId: 'part1/2' }, { unitId: 'part1/1' }] }],
        units: [
          { id: 'part1/1', label: 'פרק א׳', ref: 'Tanya, Part I 1', editions: [{ source: 0, sha256: 'a'.repeat(64), bytes: 20 }, { source: 1 }] },
          { id: 'part1/2', label: 'פרק ב׳', labelEn: 'Chapter 2', ref: 'Tanya, Part I 2', editions: [{ source: 1 }] },
        ],
      },
    },
  };

  it('parses a release with the works, and dispatches on the schema', () => {
    const file = { ...meta, byYear: { '5711': [entry] }, library, works };
    const parsed = parseWorksRelease(file);
    expect(parsed?.works.contents.tanya?.units).toHaveLength(2);
    expect(parseCatalogReleaseFile(file)).toEqual(parsed);
    expect(catalogManifestPath(3)).toBe('/v3/catalog/manifest.json');
    // A schema-2 file never passes as schema 3, nor the other way round.
    expect(parseWorksRelease({ ...file, schemaVersion: 2 })).toBeNull();
    expect(parseWorksRelease({ ...meta, byYear: {}, library })).toBeNull();
  });

  it('rejects works whose editions point past their sources, or whose contents name a missing unit', () => {
    const badEdition = structuredClone(works);
    badEdition.contents.tanya!.units[0]!.editions.push({ source: 2 });
    expect(parseCatalogWorks(badEdition)).toBeNull();
    const badContents = structuredClone(works);
    badContents.contents.tanya!.contents = [{ unitId: 'part1/9' }];
    expect(parseCatalogWorks(badContents)).toBeNull();
    const orphan = structuredClone(works) as unknown as { contents: Record<string, unknown> };
    orphan.contents.nothing = works.contents.tanya;
    expect(parseCatalogWorks(orphan)).toBeNull();
  });

  it('finds text kept for an edition that may not ship, and any local-only source', () => {
    expect(worksRightsProblems(works)).toEqual([]);
    const leaked = structuredClone(works);
    leaked.contents.tanya!.units[1]!.editions[0]!.sha256 = 'b'.repeat(64);
    const local = structuredClone(works);
    local.works[0]!.sources.push({ source: 'igros-app', sourceId: 'x', kind: 'text', licence: 'commercial', rights: 'local-only' });
    expect(worksRightsProblems(leaked)).toEqual(['tanya/part1/2: a text kept for a link-only source']);
    expect(worksRightsProblems(local)).toEqual(['tanya: a local-only source (igros-app x)']);
  });

  it('serializes schema 3 byte for byte like JSON.stringify, sharing the other parts', () => {
    const byYear = { 5711: [entry] };
    expect(serializeWorksRelease(meta, JSON.stringify(byYear), JSON.stringify(library), JSON.stringify(works))).toBe(JSON.stringify({ ...meta, byYear, library, works }));
    expect(parseCatalogManifest({ ...manifest, schemaVersion: 3, works: { works: 80, units: 2026 } })?.works).toEqual({ works: 80, units: 2026 });
  });

  it('reads units in the order of the contents, and works by author', () => {
    expect(unitsInOrder(works.contents.tanya!).map((u) => u.id)).toEqual(['part1/2', 'part1/1']);
    expect(catalogUnit(works.contents.tanya!, 'part1/2')?.labelEn).toBe('Chapter 2');
    expect(worksByAuthor(works).get('alter-rebbe')?.map((w) => w.id)).toEqual(['tanya']);
  });
});
