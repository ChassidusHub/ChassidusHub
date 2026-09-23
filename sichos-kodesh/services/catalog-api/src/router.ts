import { catalogJson, manifestJson } from '../generated/release';

/**
 * The whole API as one pure function of (method, path, origin) -> response,
 * so it can be unit-tested without a server and adapted to Vercel's Node
 * function signature in api/index.ts. What it serves is the contract in
 * packages/catalog/src/release.ts; the client is
 * packages/app-core/src/catalog/catalogUpdate.ts.
 *
 * Every response carries `Access-Control-Allow-Origin: *` - the web app is
 * on another origin, and everything here is public, read-only data with
 * no cookies or credentials involved (same reasoning as
 * services/media-proxy's CORS headers).
 */

export interface RouteResponse {
  status: number;
  headers: Record<string, string>;
  /** UTF-8 bytes; null for a response with no body (204, HEAD is handled by the adapter). */
  body: Uint8Array | null;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/** The manifest is re-read by the apps once a day; a short shared cache keeps a burst of phones off the function. `s-maxage` is what Vercel's CDN honours for function responses. */
const MANIFEST_CACHE = 'public, max-age=300, s-maxage=300';
/** A release's data never changes once published (its URL carries the version), so it can live in every cache for a year. */
const CATALOG_CACHE = 'public, max-age=31536000, s-maxage=31536000, immutable';
const NOT_FOUND_CACHE = 'public, max-age=60, s-maxage=60';

const JSON_TYPE = 'application/json; charset=utf-8';
const encoder = new TextEncoder();

interface ParsedManifest {
  version: string;
  sha256: string;
  bytes: number;
  changelog: unknown[];
  [key: string]: unknown;
}

const manifest = JSON.parse(manifestJson) as ParsedManifest;
const catalogBytes = encoder.encode(catalogJson);
export const SERVED_VERSION = manifest.version;

export const MANIFEST_PATH = '/v1/catalog/manifest.json';
export const CHANGELOG_PATH = '/v1/catalog/changelog.json';
export const LATEST_PATH = '/v1/catalog/latest/catalog.json';
const CATALOG_PATH_PATTERN = /^\/v1\/catalog\/(\d+\.\d+\.\d+)\/catalog\.json$/;

export function catalogPath(version: string = SERVED_VERSION): string {
  return `/v1/catalog/${version}/catalog.json`;
}

function json(status: number, value: unknown, cacheControl: string, extra: Record<string, string> = {}): RouteResponse {
  return {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': JSON_TYPE, 'Cache-Control': cacheControl, ...extra },
    body: encoder.encode(JSON.stringify(value)),
  };
}

function notFound(path: string): RouteResponse {
  return json(404, { error: 'not_found', path, hint: `Try ${MANIFEST_PATH}` }, NOT_FOUND_CACHE);
}

/** `origin` is the scheme + host the request arrived on (https://api.sk.shmuky.dev, or a preview deployment) - the manifest's `url` always points back into the same deployment, so what an app fetches next is the file this very API serves. */
export function handleRequest(method: string, path: string, origin: string): RouteResponse {
  const upper = method.toUpperCase();
  if (upper === 'OPTIONS') {
    return { status: 204, headers: { ...CORS_HEADERS, 'Cache-Control': NOT_FOUND_CACHE }, body: null };
  }
  if (upper !== 'GET' && upper !== 'HEAD') {
    return json(405, { error: 'method_not_allowed', method: upper }, 'no-store', { Allow: 'GET, HEAD, OPTIONS' });
  }

  if (path === MANIFEST_PATH) {
    const served = { ...manifest, url: `${origin}${catalogPath()}` };
    return json(200, served, MANIFEST_CACHE);
  }

  const catalogMatch = CATALOG_PATH_PATTERN.exec(path);
  if (catalogMatch) {
    if (catalogMatch[1] !== SERVED_VERSION) return notFound(path);
    return {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': JSON_TYPE,
        'Content-Length': String(catalogBytes.byteLength),
        'Cache-Control': CATALOG_CACHE,
        ETag: `"${manifest.sha256}"`,
        'X-Catalog-Version': SERVED_VERSION,
      },
      body: catalogBytes,
    };
  }

  if (path === LATEST_PATH) {
    return {
      status: 302,
      headers: { ...CORS_HEADERS, Location: `${origin}${catalogPath()}`, 'Cache-Control': MANIFEST_CACHE },
      body: null,
    };
  }

  if (path === CHANGELOG_PATH) {
    return json(200, manifest.changelog, MANIFEST_CACHE);
  }

  if (path === '/' || path === '/v1' || path === '/v1/catalog' || path === '/v1/catalog/') {
    return json(
      200,
      {
        name: 'Sichos Kodesh catalog API',
        catalog: SERVED_VERSION,
        endpoints: [MANIFEST_PATH, catalogPath(), CHANGELOG_PATH, LATEST_PATH],
        source: 'https://github.com/shmuky/Sichos-Kodesh/tree/main/services/catalog-api',
      },
      MANIFEST_CACHE,
    );
  }

  return notFound(path);
}
