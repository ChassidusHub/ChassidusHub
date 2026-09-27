import type { DownloadContentTypes } from '@sichos-kodesh/app-core';
import type { AudioProfile, LibraryScopeSpec, PackEntry, PackKeyPair, PackPart, PackScope, ParsedScope, WorkSelection } from '@sichos-kodesh/pack-format';
import {
  AUDIO_PROFILES,
  composeManifests,
  describeScopeList,
  entriesInScopes,
  isPackableLibraryCollection,
  isWorksEntry,
  packFileName,
  parseLibraryScopeSpec,
  parseScopeList,
  parseSections,
  resolveLibraryScope,
  resolveWorkSelection,
  signManifest,
  sizeLibrarySelection,
  sizeSelection,
  splitEntries,
  toHex,
  worksLabel,
} from '@sichos-kodesh/pack-format';
import type { PublishMeta, YearShard } from './layout.js';
import { parseCatalogYear, parseLibraryCollection, parsePublishMeta, parseWorkEntries, parseWorkParts, parseWorksShelf, parseYearShard, publishKeys } from './layout.js';
import type { PackStore } from './store.js';
import { readJson } from './store.js';
import { streamPack } from './stream.js';

/**
 * The pack API's routes, over any PackStore (R2 in the Worker, a directory
 * for `sk-pack serve`):
 *
 *   GET /v1/meta                        what is published
 *   GET /v1/catalog/<year>              that year's farbrengens, for the download site's pickers
 *   GET /v1/library/<collection>        a library collection's items and browse axes, for the same
 *   GET /v1/works                       the seforim that can join a pack, bundled by author
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
 * `scope` is a comma list of anything a pack can hold, in any mix - the
 * download site's cart: farbrengens years or months (5736, 5736-01;
 * 5736-01,5740-01 is the same month of two years) and library scopes
 * (maamorim:year:5711, likkuteiSichos:volume:12, pack-format's
 * library.ts), whose packs hold every PDF of their items and their
 * recordings in `profile`. `works` adds seforim (bundle ids, work ids or
 * `all`), their texts and search indexes as their own text packs carry
 * them; with `works`, `scope` may be left out. One pack holds all of it,
 * each file once, split into parts by `maxMb` as ever.
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
  /** Farbrengens years or months; empty when the pack holds none. */
  scopes: ParsedScope[];
  /** Library scopes, in the order asked, each once. */
  library: LibraryScopeSpec[];
  /** The `works` parameter as sent (bundles, works or `all`); null for none. */
  works: string | null;
  profile: AudioProfile;
  sections: string;
  contentTypes: DownloadContentTypes;
  maxBytes: number;
}

export function parseBuildRequest(url: URL): BuildRequest {
  const scopeParam = url.searchParams.get('scope');
  const works = url.searchParams.get('works')?.trim() || null;
  if (!scopeParam && !works) throw new HttpError(400, 'scope is required (a Hebrew year 5736, a month 5736-01, a list of them, or a library scope maamorim:year:5711), unless works names seforim');
  let scopes: ParsedScope[] = [];
  const library: LibraryScopeSpec[] = [];
  try {
    if (scopeParam) {
      const farbrengens: string[] = [];
      const seen = new Set<string>();
      for (const token of scopeParam.split(',').map((t) => t.trim()).filter(Boolean)) {
        const spec = parseLibraryScopeSpec(token);
        if (!spec) farbrengens.push(token);
        else if (!seen.has(token)) {
          seen.add(token);
          library.push(spec);
        }
      }
      if (farbrengens.length > 0) scopes = parseScopeList(farbrengens.join(','));
    }
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
  return { scopes, library, works, profile, sections, contentTypes, maxBytes: Math.floor(maxMb * 1024 * 1024) };
}

/**
 * A selection planned as pack parts. A size request needs only the parts'
 * sums; a build also needs the CRC-32 of each object it streams. Nothing
 * else a year or collection publishes is kept past its own step, so a
 * cart of every year and every collection plans within a Worker's memory.
 */
export interface PlannedBuild {
  scope: PackScope;
  /** The file-name stem. */
  slug: string;
  parts: PackPart[];
  missing: number;
  objects: number;
  objectBytes: number;
  /** sha256 -> CRC-32 of the selected objects; empty unless planned for a build. */
  crc32: Record<string, number>;
  /** How many seforim the build adds. */
  works: number;
}

export type PlanMode = 'size' | 'build';

async function loadMeta(store: PackStore): Promise<PublishMeta> {
  const meta = parsePublishMeta(await readJson(store, publishKeys.meta));
  if (!meta) throw new HttpError(503, 'nothing is published yet');
  return meta;
}

interface Selected {
  scope: PackScope;
  slug: string;
  entries: PackEntry[];
  objects: Record<string, number>;
  bytes: number;
  missing: number;
  crc32: Record<string, number>;
}

type SelectedPart = Omit<Selected, 'scope' | 'slug'>;

/** The CRC-32s a build streams: only the selected objects', never a whole shard. */
function pickCrc32(shard: YearShard, objects: Record<string, number>, mode: PlanMode): Record<string, number> {
  const out: Record<string, number> = {};
  if (mode !== 'build') return out;
  for (const sha of Object.keys(objects)) {
    const crc = shard.crc32[sha];
    if (crc !== undefined) out[sha] = crc;
  }
  return out;
}

/** Several selections as one: their entries in order, each object counted once. */
function combine(into: SelectedPart, add: SelectedPart): void {
  into.entries.push(...add.entries);
  for (const [sha, bytes] of Object.entries(add.objects)) {
    if (into.objects[sha] !== undefined) continue;
    into.objects[sha] = bytes;
    into.bytes += bytes;
  }
  into.missing += add.missing;
  Object.assign(into.crc32, add.crc32);
}

/** Every year of the list: its catalog and shard read once, its scopes (a whole year, or months) applied together. */
async function selectFarbrengens(store: PackStore, meta: PublishMeta, request: BuildRequest, scopes: ParsedScope[], mode: PlanMode): Promise<Selected> {
  const { scope, slug } = describeScopeList(scopes);
  const selected: Selected = { scope, slug, entries: [], objects: {}, bytes: 0, missing: 0, crc32: {} };
  const years = [...new Set(scopes.map((s) => s.year))];
  const unpublished = years.filter((year) => !meta.years.includes(year));
  if (unpublished.length === years.length) throw new HttpError(404, `${unpublished.join(', ')} ${unpublished.length === 1 ? 'is' : 'are'} not in the published archive`);
  for (const year of years) {
    if (!meta.years.includes(year)) continue;
    const entries = parseCatalogYear(await readJson(store, publishKeys.catalogYear(year)));
    const shard = parseYearShard(await readJson(store, publishKeys.yearShard(year)));
    if (!entries || !shard) throw new HttpError(503, `the published data for ${year} is unreadable`);
    const selection = sizeSelection(
      entriesInScopes(
        entries,
        scopes.filter((s) => s.year === year),
      ),
      request.contentTypes,
      shard.index,
      request.profile,
    );
    combine(selected, { entries: selection.entries, objects: selection.objects, bytes: selection.bytes, missing: selection.missing.length, crc32: pickCrc32(shard, selection.objects, mode) });
  }
  return selected;
}

async function selectLibrary(store: PackStore, meta: PublishMeta, request: BuildRequest, spec: LibraryScopeSpec, mode: PlanMode): Promise<Selected> {
  if (!meta.library?.includes(spec.collection)) throw new HttpError(404, `${spec.collection} is not in the published archive`);
  const collection = parseLibraryCollection(await readJson(store, publishKeys.libraryCollection(spec.collection)));
  const shard = parseYearShard(await readJson(store, publishKeys.libraryShard(spec.collection)));
  if (!collection || !shard) throw new HttpError(503, `the published data for ${spec.collection} is unreadable`);
  let resolved;
  try {
    resolved = resolveLibraryScope(spec, collection);
  } catch (error) {
    throw new HttpError(404, error instanceof Error ? error.message : String(error));
  }
  const selection = sizeLibrarySelection(spec.collection, resolved.items, shard.index, request.profile);
  return { scope: resolved.scope, slug: resolved.slug, entries: selection.entries, objects: selection.objects, bytes: selection.bytes, missing: selection.missing, crc32: pickCrc32(shard, selection.objects, mode) };
}

/** The seforim named: their entries as their text packs carry them, and their objects. */
async function selectWorks(store: PackStore, meta: PublishMeta, spec: string, mode: PlanMode): Promise<{ selection: SelectedPart; label: { he: string; en: string }; ids: string[]; slug: string }> {
  if (!meta.works) throw new HttpError(404, 'no seforim are published yet');
  const shelf = parseWorksShelf(await readJson(store, publishKeys.worksShelf));
  const shard = parseYearShard(await readJson(store, publishKeys.worksShard));
  if (!shelf || !shard) throw new HttpError(503, 'the published seforim are unreadable');
  let picked: WorkSelection[];
  try {
    picked = resolveWorkSelection(spec, shelf);
  } catch (error) {
    throw new HttpError(404, error instanceof Error ? error.message : String(error));
  }
  const selection: SelectedPart = { entries: [], objects: {}, bytes: 0, missing: 0, crc32: {} };
  for (const { id, parts } of picked) {
    let entries = parseWorkEntries(await readJson(store, publishKeys.workEntries(id)));
    if (!entries) throw new HttpError(503, `the published entries of ${id} are unreadable`);
    if (parts) {
      // Some of its parts: their texts, without the whole sefer's search index.
      const map = parseWorkParts(await readJson(store, publishKeys.workParts(id)));
      if (!map) throw new HttpError(503, `the published parts of ${id} are unreadable`);
      const wanted = new Set(parts.flatMap((part) => map[part] ?? []));
      entries = entries.filter((entry) => wanted.has(entry.itemId));
    }
    selection.entries.push(...entries);
    for (const entry of entries) {
      for (const ref of entry.refs) {
        if (selection.objects[ref.sha256] !== undefined) continue;
        selection.objects[ref.sha256] = ref.bytes;
        selection.bytes += ref.bytes;
      }
    }
  }
  selection.crc32 = pickCrc32(shard, selection.objects, mode);
  // One sefer names the file, with its parts when a few are picked (`seforim-igros-kodesh-rebbe-3-4`).
  const only = picked.length === 1 ? picked[0]! : null;
  const slug = !only ? 'seforim' : !only.parts ? `seforim-${only.id}` : only.parts.length <= 3 ? `seforim-${only.id}-${only.parts.join('-')}` : `seforim-${only.id}-parts`;
  return { selection, label: worksLabel(picked, shelf), ids: picked.map((s) => s.id), slug };
}

/** A short, stable stem for a file name, from what a mix holds. */
function mixHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

/** "A + B + C", or "A + 4 more" for a longer mix. */
function mixLabel(labels: Array<{ he: string; en: string }>): { he: string; en: string } {
  if (labels.length <= 3) return { he: labels.map((l) => l.he).join(' + '), en: labels.map((l) => l.en).join(' + ') };
  return { he: `${labels[0]!.he} ועוד ${labels.length - 1}`, en: `${labels[0]!.en} + ${labels.length - 1} more` };
}

export async function planBuild(store: PackStore, meta: PublishMeta, request: BuildRequest, mode: PlanMode = 'build'): Promise<PlannedBuild> {
  const pieces: Selected[] = [];
  if (request.scopes.length > 0) pieces.push(await selectFarbrengens(store, meta, request, request.scopes, mode));
  for (const spec of request.library) pieces.push(await selectLibrary(store, meta, request, spec, mode));
  const added = request.works ? await selectWorks(store, meta, request.works, mode) : null;
  const works = added?.ids.length ?? 0;
  if (pieces.length === 0 && !added) throw new HttpError(400, 'the selection is empty');

  let selection: Selected;
  if (pieces.length === 1 && !added) {
    selection = pieces[0]!;
  } else {
    // One scope for the whole mix: the one part's own when it is alone, else a custom scope under the first part's collection (a manifest names one).
    const labels = [...pieces.map((p) => p.scope.label), ...(added ? [added.label] : [])];
    const slugs = [...pieces.map((p) => p.slug), ...(added ? [added.slug] : [])];
    const joined = slugs.join('-');
    const first = pieces[0];
    const scope: PackScope = first
      ? pieces.length === 1
        ? { ...first.scope, label: mixLabel(labels) }
        : { kind: 'custom', collection: first.scope.collection, label: mixLabel(labels) }
      : { kind: 'custom', collection: 'works', label: added!.label };
    const slug = joined.length <= 64 ? joined : `mix-${slugs.length}-${mixHash(joined)}`;
    selection = { scope, slug, entries: [], objects: {}, bytes: 0, missing: 0, crc32: {} };
    for (const part of pieces) combine(selection, part);
    if (added) combine(selection, added.selection);
  }
  if (selection.entries.length === 0) throw new HttpError(404, 'the archive holds nothing of this selection yet');
  return {
    scope: selection.scope,
    slug: selection.slug,
    parts: splitEntries(selection.entries, request.maxBytes),
    missing: selection.missing,
    objects: Object.keys(selection.objects).length,
    objectBytes: selection.bytes,
    crc32: selection.crc32,
    works,
  };
}

/** A part's name and counts, as /v1/size lists it. */
function partSummary(plan: PlannedBuild, profile: AudioProfile, part: PackPart, index: number) {
  const count = plan.parts.length;
  return {
    index,
    file: packFileName(plan.slug, profile, count > 1 ? { index, count } : undefined),
    occasions: part.entries.filter((e) => !isWorksEntry(e)).length,
    works: new Set(part.entries.filter(isWorksEntry).map((e) => e.itemId.split('/')[0])).size,
    bytes: part.bytes,
  };
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
    const libraryMatch = /^\/v1\/library\/([A-Za-z]+)$/.exec(path);
    if (path === '/v1/works') return passThrough(store, publishKeys.worksShelf, 'application/json; charset=utf-8', 'public, max-age=3600');
    if (libraryMatch) {
      const collection = libraryMatch[1]!;
      if (!isPackableLibraryCollection(collection)) throw new HttpError(404, 'not found');
      return passThrough(store, publishKeys.libraryCollection(collection), 'application/json; charset=utf-8', 'public, max-age=3600');
    }

    if (path === '/v1/size' || path === '/v1/build') {
      const buildRequest = parseBuildRequest(url);
      const meta = await loadMeta(store);
      if (path === '/v1/size') {
        const plan = await planBuild(store, meta, buildRequest, 'size');
        const parts = plan.parts.map((part, index) => partSummary(plan, buildRequest.profile, part, index));
        return json(
          {
            scope: plan.scope,
            slug: plan.slug,
            profile: buildRequest.profile,
            sections: buildRequest.sections,
            // Occasions or library items; a sefer's units are counted as `works`, not here.
            occasions: parts.reduce((sum, p) => sum + p.occasions, 0),
            works: plan.works,
            objects: plan.objects,
            bytes: plan.objectBytes,
            missing: plan.missing,
            signed: !!options.signingKey,
            parts,
          },
          { headers: { 'Cache-Control': 'public, max-age=300' } },
        );
      }
      const plan = await planBuild(store, meta, buildRequest, 'build');
      const count = plan.parts.length;
      const partParam = url.searchParams.get('part');
      const partIndex = partParam === null ? 0 : Number(partParam) - 1;
      if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= count) throw new HttpError(400, count > 1 ? `part must be 1 to ${count}` : 'this selection is one pack; leave part out');
      // Built "at" the publish time, so the same selection always gives the same bytes (and a CDN can cache it).
      const manifests = await composeManifests({
        scope: plan.scope,
        profile: buildRequest.profile,
        catalogVersion: meta.catalogVersion,
        builtAt: meta.publishedAt,
        parts: plan.parts,
        hash: sha256Hex,
        objectsIndex: { version: meta.catalogVersion, sha256: meta.objectsIndex.sha256 },
      });
      const unsigned = manifests[partIndex]!;
      const manifest = options.signingKey ? signManifest(unsigned, options.signingKey) : unsigned;
      const pack = streamPack(store, manifest, meta, plan.crc32);
      const file = packFileName(plan.slug, buildRequest.profile, manifest.part);
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
