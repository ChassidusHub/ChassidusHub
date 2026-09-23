import { createHash } from 'node:crypto';
import { CATALOG_SCHEMA_VERSION, CATALOG_VERSION, isCatalogUpdateApplicable, parseCatalogManifest, parseCatalogRelease } from '@sichos-kodesh/catalog';
import { describe, expect, it } from 'vitest';
import { CHANGELOG_PATH, LATEST_PATH, MANIFEST_PATH, SERVED_VERSION, catalogPath, handleRequest } from '../src/router';

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
    const other = parseCatalogManifest(bodyJson(handleRequest('GET', MANIFEST_PATH, 'https://api.sk.shmuky.dev')))!;
    expect(other.url).toBe(`https://api.sk.shmuky.dev${catalogPath()}`);
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
    expect(bodyJson(get('/'))).toMatchObject({ catalog: CATALOG_VERSION });
    for (const path of ['/v2/catalog/manifest.json', '/v1/catalog/manifest', '/favicon.ico', '/api/index']) {
      expect(get(path).status).toBe(404);
    }
  });
});
