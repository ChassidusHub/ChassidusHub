import { createHash } from 'node:crypto';
import {
  CATALOG_LIBRARY_SCHEMA_VERSION,
  CATALOG_SCHEMA_VERSION,
  CATALOG_VERSION,
  CATALOG_WORKS_SCHEMA_VERSION,
  LIBRARY_COLLECTION_IDS,
  isCatalogUpdateApplicable,
  parseCatalogManifest,
  parseCatalogRelease,
  parseLibraryRelease,
  parseWorksRelease,
} from '@sichos-kodesh/catalog';
import { describe, expect, it } from 'vitest';
import { CHANGELOG_PATH, LATEST_PATH, MANIFEST_PATH, SERVED_SCHEMAS, SERVED_VERSION, catalogPath, handleRequest, manifestPath } from '../src/router';

const ORIGIN = 'https://preview.example.test';
const decoder = new TextDecoder();

function get(path: string, method = 'GET') {
  return handleRequest(method, path, ORIGIN);
}

function bodyJson(response: ReturnType<typeof handleRequest>): unknown {
  return JSON.parse(decoder.decode(response.body ?? new Uint8Array()));
}

describe('manifest', () => {
  it("serves this repository's catalog version with the contract's shape", () => {
    const response = get(MANIFEST_PATH);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(response.headers['Cache-Control']).toBe('public, max-age=300, s-maxage=300');
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    const manifest = parseCatalogManifest(bodyJson(response));
    expect(manifest).not.toBeNull();
    expect(manifest!.version).toBe(CATALOG_VERSION);
    expect(manifest!.schemaVersion).toBe(CATALOG_SCHEMA_VERSION);
    expect(SERVED_VERSION).toBe(CATALOG_VERSION);
    expect(manifest!.changelog[0]?.version).toBe(CATALOG_VERSION);
    expect(Number.isNaN(Date.parse(manifest!.releasedAt))).toBe(false);
    expect(manifest!.years.length).toBeGreaterThan(40);
    expect(manifest!.occasions).toBeGreaterThan(3000);
  });

  it("points `url` at this same origin's catalog.json, whatever host the request came in on", () => {
    const manifest = parseCatalogManifest(bodyJson(get(MANIFEST_PATH)))!;
    expect(manifest.url).toBe(`${ORIGIN}${catalogPath()}`);
    const other = parseCatalogManifest(bodyJson(handleRequest('GET', MANIFEST_PATH, 'https://api.sk.chassidushub.org')))!;
    expect(other.url).toBe(`https://api.sk.chassidushub.org${catalogPath()}`);
  });

  it('is what an app on an older catalog would apply, and what an app on this one would not', () => {
    const manifest = parseCatalogManifest(bodyJson(get(MANIFEST_PATH)))!;
    expect(isCatalogUpdateApplicable(manifest, '0.0.1', CATALOG_SCHEMA_VERSION)).toBe(true);
    expect(isCatalogUpdateApplicable(manifest, CATALOG_VERSION, CATALOG_SCHEMA_VERSION)).toBe(false);
  });
});

describe('catalog.json', () => {
  it("serves the exact bytes the manifest's sha256 and size describe, parseable as the promised release", () => {
    const manifest = parseCatalogManifest(bodyJson(get(MANIFEST_PATH)))!;
    const response = get(new URL(manifest.url).pathname);
    expect(response.status).toBe(200);
    expect(response.headers['Cache-Control']).toBe('public, max-age=31536000, s-maxage=31536000, immutable');
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(response.headers['Content-Length']).toBe(String(manifest.bytes));
    expect(response.body!.byteLength).toBe(manifest.bytes);
    expect(createHash('sha256').update(response.body!).digest('hex')).toBe(manifest.sha256);
    expect(response.headers.ETag).toBe(`"${manifest.sha256}"`);
    const release = parseCatalogRelease(bodyJson(response));
    expect(release).not.toBeNull();
    expect(release!.version).toBe(manifest.version);
    expect(release!.schemaVersion).toBe(manifest.schemaVersion);
    expect(Object.keys(release!.byYear).map(Number)).toEqual(manifest.years);
  });

  it('is a JSON 404 for any other version - never a 500, never another version\'s data', () => {
    for (const version of ['0.0.1', '99.0.0', `${SERVED_VERSION}0`]) {
      const response = get(catalogPath(version));
      expect(response.status).toBe(404);
      expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8');
      expect(bodyJson(response)).toMatchObject({ error: 'not_found', path: catalogPath(version) });
    }
    expect(get('/v1/catalog/latest/catalog.json.bak').status).toBe(404);
  });

  it('redirects /latest/ to the served version on the same origin', () => {
    const response = get(LATEST_PATH);
    expect(response.status).toBe(302);
    expect(response.headers.Location).toBe(`${ORIGIN}${catalogPath()}`);
  });
});

describe('the rest of the surface', () => {
  it('serves the changelog alone', () => {
    const response = get(CHANGELOG_PATH);
    expect(response.status).toBe(200);
    expect((bodyJson(response) as Array<{ version: string }>)[0]?.version).toBe(CATALOG_VERSION);
  });

  it('answers a CORS preflight with 204 and the allow headers', () => {
    const response = get(catalogPath(), 'OPTIONS');
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(response.headers['Access-Control-Allow-Methods']).toBe('GET, HEAD, OPTIONS');
  });

  it('treats HEAD like GET (the adapter drops the body) and refuses other methods', () => {
    expect(get(MANIFEST_PATH, 'HEAD').status).toBe(200);
    const post = get(MANIFEST_PATH, 'POST');
    expect(post.status).toBe(405);
    expect(post.headers.Allow).toBe('GET, HEAD, OPTIONS');
  });

  it('describes itself at the root and 404s everything unknown', () => {
    expect(bodyJson(get('/'))).toMatchObject({ catalog: CATALOG_VERSION, schemas: [1, 2, 3] });
    for (const path of ['/v4/catalog/manifest.json', '/v4', '/v1/catalog/manifest', '/favicon.ico', '/api/index']) {
      expect(get(path).status).toBe(404);
    }
  });
});

describe('schema 2: the phone app\'s library, under /v2/', () => {
  it('is served next to schemas 1 and 3', () => {
    expect(SERVED_SCHEMAS).toEqual([1, 2, 3]);
  });

  it('has a manifest of its own schema, with the collection counts, pointing at /v2/', () => {
    const manifest = parseCatalogManifest(bodyJson(get(manifestPath(2))))!;
    expect(manifest.schemaVersion).toBe(CATALOG_LIBRARY_SCHEMA_VERSION);
    expect(manifest.version).toBe(CATALOG_VERSION);
    expect(manifest.url).toBe(`${ORIGIN}${catalogPath(CATALOG_VERSION, 2)}`);
    expect(Object.keys(manifest.collections ?? {})).toEqual([...LIBRARY_COLLECTION_IDS]);
    expect(isCatalogUpdateApplicable(manifest, '0.0.1', CATALOG_LIBRARY_SCHEMA_VERSION)).toBe(true);
    // A schema-1 app (the web) never takes it.
    expect(isCatalogUpdateApplicable(manifest, '0.0.1', CATALOG_SCHEMA_VERSION)).toBe(false);
  });

  it('serves exactly the bytes its manifest describes: the same farbrengens as /v1/, plus the library', () => {
    const manifest = parseCatalogManifest(bodyJson(get(manifestPath(2))))!;
    const response = get(new URL(manifest.url).pathname);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Length']).toBe(String(manifest.bytes));
    expect(createHash('sha256').update(response.body!).digest('hex')).toBe(manifest.sha256);
    const release = parseLibraryRelease(bodyJson(response));
    expect(release).not.toBeNull();
    const v1 = parseCatalogRelease(bodyJson(get(catalogPath())))!;
    expect(JSON.stringify(release!.byYear)).toBe(JSON.stringify(v1.byYear));
    for (const id of LIBRARY_COLLECTION_IDS) expect(release!.library.collections[id].items.length).toBe(manifest.collections![id]);
  });

  it('404s a schema-2 path for another version, and redirects its /latest/', () => {
    expect(get(catalogPath('0.0.1', 2)).status).toBe(404);
    expect(get('/v2/catalog/latest/catalog.json').headers.Location).toBe(`${ORIGIN}${catalogPath(CATALOG_VERSION, 2)}`);
  });
});

describe('schema 3: the phone app\'s works, under /v3/', () => {
  it('has a manifest of its own schema, with the work counts, pointing at /v3/', () => {
    const manifest = parseCatalogManifest(bodyJson(get(manifestPath(3))))!;
    expect(manifest.schemaVersion).toBe(CATALOG_WORKS_SCHEMA_VERSION);
    expect(manifest.version).toBe(CATALOG_VERSION);
    expect(manifest.url).toBe(`${ORIGIN}${catalogPath(CATALOG_VERSION, 3)}`);
    expect(manifest.works!.works).toBeGreaterThan(0);
    expect(isCatalogUpdateApplicable(manifest, '0.0.1', CATALOG_WORKS_SCHEMA_VERSION)).toBe(true);
    // A phone still on schema 2 never takes it.
    expect(isCatalogUpdateApplicable(manifest, '0.0.1', CATALOG_LIBRARY_SCHEMA_VERSION)).toBe(false);
  });

  it('serves exactly the bytes its manifest describes: schema 2 as it is, plus the works', () => {
    const manifest = parseCatalogManifest(bodyJson(get(manifestPath(3))))!;
    const response = get(new URL(manifest.url).pathname);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Length']).toBe(String(manifest.bytes));
    expect(createHash('sha256').update(response.body!).digest('hex')).toBe(manifest.sha256);
    const release = parseWorksRelease(bodyJson(response))!;
    expect(release).not.toBeNull();
    const v2 = parseLibraryRelease(bodyJson(get(catalogPath(CATALOG_VERSION, 2))))!;
    expect(JSON.stringify(release.library)).toBe(JSON.stringify(v2.library));
    expect(release.works.works).toHaveLength(manifest.works!.works);
    expect(Object.values(release.works.contents).reduce((n, part) => n + part.units.length, 0)).toBe(manifest.works!.units);
  });
});
