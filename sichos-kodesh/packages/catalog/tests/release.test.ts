import { describe, expect, it } from 'vitest';
import { CATALOG_CHANGELOG } from '../src/changelog.js';
import { catalogReleasePath, catalogReleaseTag, compareCatalogVersions, isCatalogUpdateApplicable, parseCatalogManifest, parseCatalogRelease } from '../src/release.js';
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
