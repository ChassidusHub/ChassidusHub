import { byYearJson, catalogHead, libraryHead, libraryJson, libraryManifestJson, manifestJson, worksHead, worksJson, worksManifestJson } from '../generated/release';

/**
 * The whole API as one pure function of (method, path, origin) -> response,
 * so it can be unit-tested without a server and adapted to a Worker's
 * fetch in src/worker.ts. What it serves is the contract in
 * packages/catalog/src/release.ts; the client is
 * packages/app-core/src/catalog/catalogUpdate.ts.
 *
 * Three schemas side by side: `/v1/` is the farbrengens (the web app),
 * `/v2/` is the same farbrengens plus the library (phones up to mobile
 * 1.4.0), `/v3/` adds the works (the phone from 1.5.0). Every catalog.json
 * is put back together here from one copy of each part (see
 * scripts/build.mjs), byte for byte what its manifest's sha256 describes.
 *
 * Every response carries `Access-Control-Allow-Origin: *` - the web app is
 * on another origin, and everything here is public, read-only data with
 * no cookies or credentials involved (same reasoning as
 * services/media-proxy's CORS headers).
 */

/** Where the texts are, each at its sha256: passed on from ChassidusHub by the Worker (src/worker.ts). */
export const TEXTS_PATH = '/v3/texts/<sha256>';

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

/** The manifest is re-read by the apps once a day; a short shared cache keeps a burst of phones off the Worker. */
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

interface Served {
  schema: number;
  manifest: ParsedManifest;
  bytes: Uint8Array;
}

const SERVED: Served[] = [
  { schema: 1, manifest: JSON.parse(manifestJson) as ParsedManifest, bytes: encoder.encode(`${catalogHead}${byYearJson}}`) },
  ...(libraryManifestJson
    ? [{ schema: 2, manifest: JSON.parse(libraryManifestJson) as ParsedManifest, bytes: encoder.encode(`${libraryHead}${byYearJson},"library":${libraryJson}}`) }]
    : []),
  ...(worksManifestJson
    ? [{ schema: 3, manifest: JSON.parse(worksManifestJson) as ParsedManifest, bytes: encoder.encode(`${worksHead}${byYearJson},"library":${libraryJson},"works":${worksJson}}`) }]
    : []),
];

export const SERVED_VERSION = SERVED[0]!.manifest.version;
/** The schemas this deployment serves: [1], [1, 2] or [1, 2, 3]. */
export const SERVED_SCHEMAS = SERVED.map((s) => s.schema);

export function manifestPath(schema = 1): string {
  return `/v${schema}/catalog/manifest.json`;
}

export function changelogPath(schema = 1): string {
  return `/v${schema}/catalog/changelog.json`;
}

export function latestPath(schema = 1): string {
  return `/v${schema}/catalog/latest/catalog.json`;
}

export function catalogPath(version: string = SERVED_VERSION, schema = 1): string {
  return `/v${schema}/catalog/${version}/catalog.json`;
}

export const MANIFEST_PATH = manifestPath(1);
export const CHANGELOG_PATH = changelogPath(1);
export const LATEST_PATH = latestPath(1);
const CATALOG_PATH_PATTERN = /^\/v(\d+)\/catalog\/(\d+\.\d+\.\d+)\/catalog\.json$/;

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

/** `origin` is the scheme + host the request arrived on (https://api.sk.chassidushub.org, or a preview) - the manifest's `url` always points back into the same deployment, so what an app fetches next is the file this very API serves. */
export function handleRequest(method: string, path: string, origin: string): RouteResponse {
  const upper = method.toUpperCase();
  if (upper === 'OPTIONS') {
    return { status: 204, headers: { ...CORS_HEADERS, 'Cache-Control': NOT_FOUND_CACHE }, body: null };
  }
  if (upper !== 'GET' && upper !== 'HEAD') {
    return json(405, { error: 'method_not_allowed', method: upper }, 'no-store', { Allow: 'GET, HEAD, OPTIONS' });
  }

  for (const served of SERVED) {
    const version = served.manifest.version;
    if (path === manifestPath(served.schema)) {
      return json(200, { ...served.manifest, url: `${origin}${catalogPath(version, served.schema)}` }, MANIFEST_CACHE);
    }
    if (path === latestPath(served.schema)) {
      return { status: 302, headers: { ...CORS_HEADERS, Location: `${origin}${catalogPath(version, served.schema)}`, 'Cache-Control': MANIFEST_CACHE }, body: null };
    }
    if (path === changelogPath(served.schema)) {
      return json(200, served.manifest.changelog, MANIFEST_CACHE);
    }
  }

  const catalogMatch = CATALOG_PATH_PATTERN.exec(path);
  if (catalogMatch) {
    const served = SERVED.find((s) => s.schema === Number(catalogMatch[1]));
    if (!served || catalogMatch[2] !== served.manifest.version) return notFound(path);
    return {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': JSON_TYPE,
        'Content-Length': String(served.bytes.byteLength),
        'Cache-Control': CATALOG_CACHE,
        ETag: `"${served.manifest.sha256}"`,
        'X-Catalog-Version': served.manifest.version,
      },
      body: served.bytes,
    };
  }

  const indexMatch = /^\/v(\d+)(?:\/catalog)?\/?$/.exec(path);
  if (path === '/' || (indexMatch && SERVED_SCHEMAS.includes(Number(indexMatch[1])))) {
    return json(
      200,
      {
        name: 'Sichos Kodesh catalog API',
        catalog: SERVED_VERSION,
        schemas: SERVED_SCHEMAS,
        endpoints: SERVED.flatMap((s) => [manifestPath(s.schema), catalogPath(s.manifest.version, s.schema), changelogPath(s.schema), latestPath(s.schema)]),
        // Each text at its sha256, as the works name it: ChassidusHub's, passed on by the Worker (src/worker.ts).
        texts: TEXTS_PATH,
        // The phone app's newest release, passed through from the app server (src/worker.ts).
        app: { android: '/v1/app/android/latest.json', download: '/v1/app/android/download/<arm64-v8a|armeabi-v7a|universal>' },
        source: 'https://github.com/ChassidusHub/ChassidusHub/tree/main/sichos-kodesh/services/catalog-api',
      },
      MANIFEST_CACHE,
    );
  }

  return notFound(path);
}
