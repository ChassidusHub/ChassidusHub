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
  serializeCatalogRelease,
  serializeLibraryRelease,
} from '../src/release.js';
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
});

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
