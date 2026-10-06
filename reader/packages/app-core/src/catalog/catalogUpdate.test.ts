import { describe, expect, it } from 'vitest';
import { CATALOG_CHECK_INTERVAL_MS, catalogManifestUrl, checkCatalogUpdate, fetchCatalogRelease, shouldCheckCatalog } from './catalogUpdate.js';
import type { FetchLike } from './catalogUpdate.js';

const entry = { occasionId: 1, hebrewYear: 5711, hebrewDate: '5711-01-09', occasionLabel: 'x', audio: [], pdfs: [] };
const manifest = { schemaVersion: 1, version: '1.1.0', releasedAt: 'x', url: 'https://api.chassidushub.org/v1/app/v1/catalog/1.1.0/catalog.json', bytes: 1, sha256: '', years: [5711], occasions: 1, changelog: [] };

function fakeFetch(routes: Record<string, unknown | (() => never)>, status = 200): FetchLike {
  return async (url) => {
    const body = routes[url];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    if (typeof body === 'function') (body as () => never)();
    return { ok: status < 400, status, json: async () => body };
  };
}

describe('shouldCheckCatalog', () => {
  it('checks before the first time, after an app update, and once a day otherwise', () => {
    const now = 1_000_000_000_000;
    expect(shouldCheckCatalog({ checkedAt: null, appVersion: null }, '1.2.0', now)).toBe(true);
    expect(shouldCheckCatalog({ checkedAt: now - 1000, appVersion: '1.1.0' }, '1.2.0', now)).toBe(true);
    expect(shouldCheckCatalog({ checkedAt: now - 1000, appVersion: '1.2.0' }, '1.2.0', now)).toBe(false);
    expect(shouldCheckCatalog({ checkedAt: now - CATALOG_CHECK_INTERVAL_MS, appVersion: '1.2.0' }, '1.2.0', now)).toBe(true);
  });
});

describe('checkCatalogUpdate', () => {
  it('reports a newer release as available', async () => {
    const result = await checkCatalogUpdate({ currentVersion: '1.0.0', schemaVersion: 1, fetchFn: fakeFetch({ [catalogManifestUrl()]: manifest }) });
    expect(result).toEqual({ status: 'available', manifest });
  });

  it('reports the current release as up to date', async () => {
    const result = await checkCatalogUpdate({ currentVersion: '1.1.0', schemaVersion: 1, fetchFn: fakeFetch({ [catalogManifestUrl()]: manifest }) });
    expect(result.status).toBe('up-to-date');
  });

  it('turns an unreachable or broken API into an error result, never a throw', async () => {
    expect((await checkCatalogUpdate({ currentVersion: '1.0.0', schemaVersion: 1, fetchFn: fakeFetch({}) })).status).toBe('error');
    const throwing: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await checkCatalogUpdate({ currentVersion: '1.0.0', schemaVersion: 1, fetchFn: throwing })).toEqual({ status: 'error', error: 'Failed to fetch' });
    expect((await checkCatalogUpdate({ currentVersion: '1.0.0', schemaVersion: 1, fetchFn: fakeFetch({ [catalogManifestUrl()]: { nope: true } }) })).status).toBe('error');
  });
});

describe('fetchCatalogRelease', () => {
  const good = { schemaVersion: 1, version: '1.1.0', releasedAt: 'x', byYear: { 5711: [entry] } };

  it('returns the validated release the manifest points at', async () => {
    const release = await fetchCatalogRelease(manifest, fakeFetch({ [manifest.url]: good }));
    expect(release.byYear[5711]).toEqual([entry]);
  });

  it('rejects a file whose version is not the one the manifest promised', async () => {
    await expect(fetchCatalogRelease(manifest, fakeFetch({ [manifest.url]: { ...good, version: '1.0.0' } }))).rejects.toThrow(/promised/);
  });

  it('rejects a malformed file and a failed download', async () => {
    await expect(fetchCatalogRelease(manifest, fakeFetch({ [manifest.url]: { byYear: 'x' } }))).rejects.toThrow(/shape/);
    await expect(fetchCatalogRelease(manifest, fakeFetch({}))).rejects.toThrow(/404/);
  });
});

describe('schema 2 (the phone)', () => {
  const collection = { items: [], groups: {} };
  const library = {
    moadim: [],
    parshiyos: [],
    collections: { likkuteiSichos: collection, maamorim: collection, yomanim: collection, hadranim: collection, michtavimKlolim: collection, reshimos: collection, jemEvents: collection },
  };
  const manifest2 = { ...manifest, schemaVersion: 2, url: 'https://api.chassidushub.org/v1/app/v2/catalog/1.1.0/catalog.json' };

  it('reads its own manifest under /v2/', async () => {
    expect(catalogManifestUrl()).toBe('https://api.chassidushub.org/v1/app/v1/catalog/manifest.json');
    expect(catalogManifestUrl(undefined, 2)).toBe('https://api.chassidushub.org/v1/app/v2/catalog/manifest.json');
    const result = await checkCatalogUpdate({ currentVersion: '1.0.0', schemaVersion: 2, fetchFn: fakeFetch({ [catalogManifestUrl(undefined, 2)]: manifest2 }) });
    expect(result.status).toBe('available');
  });

  it('fetches a release that carries the library', async () => {
    const release = await fetchCatalogRelease(manifest2, fakeFetch({ [manifest2.url]: { schemaVersion: 2, version: '1.1.0', releasedAt: 'x', byYear: { 5711: [entry] }, library } }));
    expect(release).toHaveProperty('library.moadim', []);
  });

  it('rejects a schema-2 file without its library', async () => {
    await expect(fetchCatalogRelease(manifest2, fakeFetch({ [manifest2.url]: { schemaVersion: 2, version: '1.1.0', releasedAt: 'x', byYear: {} } }))).rejects.toThrow(/shape/);
  });
});
