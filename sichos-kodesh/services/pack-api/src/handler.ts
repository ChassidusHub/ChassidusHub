import type { DownloadContentTypes } from '@sichos-kodesh/app-core';
import type { AudioProfile, PackKeyPair, PackManifest, ParsedScope } from '@sichos-kodesh/pack-format';
import { AUDIO_PROFILES, composeManifests, entriesInScope, packFileName, parseScope, parseSections, signManifest, sizeSelection, splitEntries, toHex } from '@sichos-kodesh/pack-format';
import type { PublishMeta, YearShard } from './layout.js';
import { parseCatalogYear, parsePublishMeta, parseYearShard, publishKeys } from './layout.js';
import type { PackStore } from './store.js';
import { readJson } from './store.js';
import { streamPack } from './stream.js';

/**
 * The pack API's routes, over any PackStore (R2 in the Worker, a directory
 * for `sk-pack serve`):
 *
 *   GET /v1/meta                        what is published
 *   GET /v1/catalog/<year>              that year's farbrengens, for the download site's pickers
 *   GET /v1/objects.json                the objects index (the phone's trust anchor)
 *   GET /v1/packs/index.json            the prebuilt packs
 *   GET /v1/packs/<file>                one prebuilt pack
 *   GET /v1/size?scope=&profile=&sections=&maxMb=     the exact size of a selection, and its parts
 *   GET /v1/build?scope=&profile=&sections=&maxMb=&part=   that selection as a signed pack, streamed
 *
 * A custom build is a concatenation: the selection is sized with
 * pack-format's sizeSelection (as the site, the builder and the phone do),
 * split by whole occasions, signed, and streamed from the archive's objects
 * in one pass. The URL is the selection, so a CDN caches each build.
 */

export interface HandlerOptions {
  /** Null serves unsigned packs, which the apps take only as loose files (for local testing). */
  signingKey: PackKeyPair | null;
  now?: () => Date;
  /** Access-Control-Allow-Origin for the download site. */
  corsOrigin?: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_MAX_MB = 200;
const MAX_MAX_MB = 3500;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return toHex(new Uint8Array(digest));
}

export interface BuildRequest {
  scope: ParsedScope;
  profile: AudioProfile;
  sections: string;
  contentTypes: DownloadContentTypes;
  maxBytes: number;
}

export function parseBuildRequest(url: URL): BuildRequest {
  const scopeParam = url.searchParams.get('scope');
  if (!scopeParam) throw new HttpError(400, 'scope is required: a Hebrew year (5736) or a year and month token (5736-01)');
  let scope: ParsedScope;
  try {
    scope = parseScope(scopeParam);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error));
  }
  const profile = (url.searchParams.get('profile') ?? 'src') as AudioProfile;
  if (!(AUDIO_PROFILES as readonly string[]).includes(profile)) throw new HttpError(400, `profile must be one of ${AUDIO_PROFILES.join(', ')}`);
  const sections = url.searchParams.get('sections') ?? 'essentials';
  let contentTypes: DownloadContentTypes;
  try {
    contentTypes = parseSections(sections);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error));
  }
  const maxMb = Number(url.searchParams.get('maxMb') ?? DEFAULT_MAX_MB);
  if (!(maxMb > 0) || maxMb > MAX_MAX_MB) throw new HttpError(400, `maxMb must be between 1 and ${MAX_MAX_MB}`);
  return { scope, profile, sections, contentTypes, maxBytes: Math.floor(maxMb * 1024 * 1024) };
}

export interface PlannedBuild {
  manifests: PackManifest[];
  bytes: number[];
  missing: number;
  objects: number;
  objectBytes: number;
  shard: YearShard;
}

async function loadMeta(store: PackStore): Promise<PublishMeta> {
  const meta = parsePublishMeta(await readJson(store, publishKeys.meta));
  if (!meta) throw new HttpError(503, 'nothing is published yet');
  return meta;
}

export async function planBuild(store: PackStore, meta: PublishMeta, request: BuildRequest, builtAt: string): Promise<PlannedBuild> {
  const year = request.scope.year;
  if (!meta.years.includes(year)) throw new HttpError(404, `${year} is not in the published archive`);
  const entries = parseCatalogYear(await readJson(store, publishKeys.catalogYear(year)));
  const shard = parseYearShard(await readJson(store, publishKeys.yearShard(year)));
  if (!entries || !shard) throw new HttpError(503, `the published data for ${year} is unreadable`);
  const selection = sizeSelection(entriesInScope(entries, request.scope), request.contentTypes, shard.index, request.profile);
  if (selection.entries.length === 0) throw new HttpError(404, 'the archive holds nothing of this selection yet');
  const parts = splitEntries(selection.entries, request.maxBytes);
  const manifests = await composeManifests({
    scope: request.scope.scope,
    profile: request.profile,
    catalogVersion: meta.catalogVersion,
    builtAt,
    parts,
    hash: sha256Hex,
    objectsIndex: { version: meta.catalogVersion, sha256: meta.objectsIndex.sha256 },
  });
  return { manifests, bytes: parts.map((part) => part.bytes), missing: selection.missing.length, objects: Object.keys(selection.objects).length, objectBytes: selection.bytes, shard };
}

function json(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers ?? {}) } });
}

async function passThrough(store: PackStore, key: string, contentType: string, cache: string): Promise<Response> {
  const object = await store.get(key);
  if (!object) throw new HttpError(404, 'not found');
  return new Response(object.body, { headers: { 'Content-Type': contentType, 'Content-Length': String(object.size), 'Cache-Control': cache } });
}

const SAFE_PACK_FILE = /^[A-Za-z0-9._-]+\.skpack$/;

export function createHandler(store: PackStore, options: HandlerOptions): (request: Request) => Promise<Response> {
  const now = options.now ?? (() => new Date());
  const cors: Record<string, string> = options.corsOrigin
    ? { 'Access-Control-Allow-Origin': options.corsOrigin, 'Access-Control-Expose-Headers': 'Content-Length, Content-Disposition, X-SK-Pack-Id, X-SK-Signed' }
    : {};

  async function route(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' } });
    if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'only GET');
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (path === '/v1/meta') return json(await loadMeta(store), { headers: { 'Cache-Control': 'public, max-age=300' } });
    if (path === '/v1/objects.json') return passThrough(store, publishKeys.objectsIndex, 'application/json; charset=utf-8', 'public, max-age=3600');
    if (path === '/v1/packs/index.json') return passThrough(store, publishKeys.packsIndex, 'application/json; charset=utf-8', 'public, max-age=300');
    const packMatch = /^\/v1\/packs\/([^/]+)$/.exec(path);
    if (packMatch) {
      const file = decodeURIComponent(packMatch[1]!);
      if (!SAFE_PACK_FILE.test(file)) throw new HttpError(404, 'not found');
      const response = await passThrough(store, publishKeys.pack(file), 'application/zip', 'public, max-age=86400, immutable');
      response.headers.set('Content-Disposition', `attachment; filename="${file}"`);
      return response;
    }
    const catalogMatch = /^\/v1\/catalog\/(\d{4})$/.exec(path);
    if (catalogMatch) return passThrough(store, publishKeys.catalogYear(Number(catalogMatch[1])), 'application/json; charset=utf-8', 'public, max-age=3600');

    if (path === '/v1/size' || path === '/v1/build') {
      const buildRequest = parseBuildRequest(url);
      const meta = await loadMeta(store);
      // Built "at" the publish time, so the same selection always gives the same bytes (and a CDN can cache it).
      const plan = await planBuild(store, meta, buildRequest, meta.publishedAt);
      const count = plan.manifests.length;
      if (path === '/v1/size') {
        return json(
          {
            scope: buildRequest.scope.scope,
            slug: buildRequest.scope.slug,
            profile: buildRequest.profile,
            sections: buildRequest.sections,
            occasions: plan.manifests.reduce((sum, m) => sum + m.entries.length, 0),
            objects: plan.objects,
            bytes: plan.objectBytes,
            missing: plan.missing,
            signed: !!options.signingKey,
            parts: plan.manifests.map((manifest, index) => ({
              index,
              file: packFileName(buildRequest.scope.slug, buildRequest.profile, manifest.part),
              occasions: manifest.entries.length,
              bytes: plan.bytes[index],
            })),
          },
          { headers: { 'Cache-Control': 'public, max-age=300' } },
        );
      }
      const partParam = url.searchParams.get('part');
      const partIndex = partParam === null ? 0 : Number(partParam) - 1;
      if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= count) throw new HttpError(400, count > 1 ? `part must be 1 to ${count}` : 'this selection is one pack; leave part out');
      const unsigned = plan.manifests[partIndex]!;
      const manifest = options.signingKey ? signManifest(unsigned, options.signingKey) : unsigned;
      const pack = streamPack(store, manifest, meta, plan.shard);
      const file = packFileName(buildRequest.scope.slug, buildRequest.profile, manifest.part);
      return new Response(request.method === 'HEAD' ? null : pack.body, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': String(pack.size),
          'Content-Disposition': `attachment; filename="${file}"`,
          'Cache-Control': 'public, max-age=86400',
          'X-SK-Pack-Id': manifest.packId,
          'X-SK-Signed': options.signingKey ? manifest.signature!.keyId : 'unsigned',
        },
      });
    }
    throw new HttpError(404, 'not found');
  }

  return async (request) => {
    let response: Response;
    try {
      response = await route(request);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      response = json({ error: error instanceof Error ? error.message : String(error) }, { status, headers: { 'Cache-Control': 'no-store' } });
    }
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  };
}
