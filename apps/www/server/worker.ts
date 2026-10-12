import { WorkerEntrypoint } from 'cloudflare:workers';
import { createRequestHandler, type ServerBuild } from 'react-router';
import { apiFor, forwardFor, visitorApi } from '../app/lib/api';
import { pageContext } from '../app/serverOnly';
import { serverCatalog } from '../app/catalog/onServer';
import { forEdge, inGroups, mayUseEdge, pageTag, Seen, seenIn, tagged, whenSent } from './edge';
import { apiFiles, bucketFiles, catalogFile, indexKeeper, keptAtEdge, type EdgeStore, type SnapshotBucket, type SnapshotFiles } from './catalog';
import { bucketShowcases, type ShowcaseBucket } from '../app/stewards/showcase';
import { pageTiming, withTiming } from './serverTiming';
// @ts-ignore - made by `react-router build`
import * as build from '../build/server/index.js';

interface Env {
  /** The API Worker, reached inside Cloudflare (wrangler.toml). */
  API?: { fetch(input: string, init?: RequestInit): Promise<Response> };
  /** The API's public address, used only when the binding is absent. */
  API_URL?: string;
  /** The public bucket, where showcases are kept (app/stewards/showcase.ts). */
  FILES_PUBLIC?: ShowcaseBucket;
  /** "off" hands the browser no catalog snapshot, so its clicks are all drawn by the server (server/catalog.ts). */
  CATALOG_SNAPSHOT?: string;
}

interface Ctx {
  waitUntil(work: Promise<unknown>): void;
  /** The Worker's own entrypoints (wrangler.toml, [exports]): `CachedPage`, behind the Workers cache. */
  exports?: { CachedPage?: { fetch(request: Request): Promise<Response> } };
}

/**
 * The new site on Cloudflare Workers. Built files (build/client) are answered
 * by the Workers assets binding before this runs (wrangler.toml); everything
 * else is a page, rendered here.
 */
const serverBuild = build as unknown as ServerBuild;
const handler = createRequestHandler(serverBuild);

type Binding = NonNullable<Env['API']>;

/**
 * A page drawn now. `binding` is how its loaders reach the API (as nobody: no
 * cookie goes with a page's reads). `later` keeps the catalog snapshot's
 * index fresh behind the page (the Worker's waitUntil); `shows` notes the
 * items a page drawn from the snapshot shows, for its edge tags, and `failed`
 * that a part of it streamed later failed.
 */
function draw(request: Request, env: Env, binding: Binding | undefined, later: (work: Promise<unknown>) => void, shows?: (ids: Iterable<string>) => void, failed?: () => void): Promise<Response> {
  const api = apiFor({ binding, baseUrl: env.API_URL });
  const catalog = catalogReads(env);
  return handler(request, {
    api,
    ...(catalog ? { catalog: catalog(api) } : {}),
    shows,
    failed,
    visitor: visitorApi(request, (cookie) => apiFor({ binding: env.API, baseUrl: env.API_URL, cookie })),
    forward: forwardFor({ binding: env.API, baseUrl: env.API_URL }),
    showcases: env.FILES_PUBLIC ? bucketShowcases(env.FILES_PUBLIC) : undefined,
    ...pageContext(request, catalogIndex(env)(later)),
  });
}

/**
 * Pages anyone may have, behind Cloudflare's Workers cache (wrangler.toml,
 * [exports]; server/edge.ts). It runs only when the edge has no copy. Its
 * reads of the API ask for the API's answers as they are now, not the API's
 * own kept ones, since the page they make may be kept for days; and they
 * note which items the page is about, for its Cache-Tag.
 */
export class CachedPage extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const seen = new Seen();
    const api = this.env.API;
    const fresh = (input: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('Cache-Control', 'no-cache');
      return api ? api.fetch(input, { ...init, headers }) : fetch(input, { ...init, headers });
    };
    // Said in its Server-Timing as `drawn`, with when: the edge keeps the header with the page (server/serverTiming.ts).
    const started = performance.now();
    const timing = pageTiming();
    const shows = (ids: Iterable<string>) => {
      for (const id of ids) seen.ids.add(id);
    };
    seen.page = pageTag(request);
    const failed = () => void (seen.failed = true);
    const page = await tagged(await draw(request, this.env, { fetch: timing.timed(seenIn(fresh, seen)) }, (work) => this.ctx.waitUntil(work), shows, failed), seen);
    // A part that failed after the page said it may be kept: once it has all gone (and so been kept), it is forgotten (#342).
    return whenSent(withTiming(page, timing.header(performance.now() - started, 'drawn')), () => {
      if (seen.failed && this.ctx.cache) this.ctx.waitUntil(forgetSoon(this.ctx.cache, seen.page!));
    });
  }

  /**
   * Forgets every kept page about one of these items (called by the API once
   * a minute with what changed, services/api/src/pages.ts). Cloudflare takes
   * 100 tags in a purge and a few purges a minute; past `groups` purges it
   * is cheaper to forget every page at once. Answers whether it all went.
   */
  async forget(ids: string[], groups = 20): Promise<{ ok: boolean; purges: number; errors: string[] }> {
    const batches = inGroups(ids);
    if (batches.length === 0) return { ok: true, purges: 0, errors: [] };
    const cache = this.ctx.cache;
    if (!cache) return { ok: false, purges: 0, errors: ['this Worker has no cache to purge'] };
    const results = batches.length > groups ? [await cache.purge({ purgeEverything: true })] : await Promise.all(batches.map((tags) => cache.purge({ tags })));
    const errors = results.flatMap((r) => (r.success ? [] : (r.errors ?? [{ code: 0, message: 'refused' }]).map((e) => `${e.code} ${e.message}`)));
    return { ok: errors.length === 0, purges: results.length, errors };
  }
}

/** Forgets one kept page a moment after it went out, when the edge has kept it. */
async function forgetSoon(cache: { purge(options: { tags: string[] }): Promise<unknown> }, tag: string): Promise<void> {
  await new Promise((done) => setTimeout(done, 1000));
  await cache.purge({ tags: [tag] }).catch(() => undefined);
}

/** The catalog snapshot's files, read once per isolate (server/catalog.ts). */
let snapshotFiles: SnapshotFiles | null = null;

function catalogFiles(env: Env): SnapshotFiles | null {
  if (env.CATALOG_SNAPSHOT === 'off') return null;
  // Straight from the bucket the API writes them to, else through the API.
  snapshotFiles ??= keptAtEdge(
    env.FILES_PUBLIC
      ? bucketFiles(env.FILES_PUBLIC as unknown as SnapshotBucket)
      : apiFiles(env.API_URL ?? 'https://api.chassidushub.org', (url) => (env.API ? env.API.fetch(url) : fetch(url))),
    (globalThis as { caches?: { default?: EdgeStore } }).caches?.default,
  );
  return snapshotFiles;
}

/** The snapshot's reads for the pages drawn from it on the server (app/catalog/onServer.ts), made once per isolate. */
let keptReads: ((api: ReturnType<typeof apiFor>) => ReturnType<typeof apiFor>) | null | undefined;
const catalogReads = (env: Env) => {
  if (keptReads === undefined) {
    const files = catalogFiles(env);
    keptReads = files ? serverCatalog(files) : null;
  }
  return keptReads;
};

/** The catalog snapshot's index for pages' HTML, kept in this isolate (server/catalog.ts). */
let keptIndex: ReturnType<typeof indexKeeper> | null = null;
const catalogIndex = (env: Env) => (keptIndex ??= indexKeeper(catalogFiles(env)));

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    // The catalog snapshot's files, for the browser to keep (/_/ is never a kept page).
    const file = await catalogFile(request, catalogFiles(env), () => apiFor({ binding: env.API, baseUrl: env.API_URL }).transcribedRecordings({ limit: 1000 }));
    if (file) return file;
    // Every page says how long it took and what it waited on, in its Server-Timing (server/serverTiming.ts).
    const started = performance.now();
    const cached = ctx.exports?.CachedPage;
    if (cached && mayUseEdge(request)) {
      const page = await cached.fetch(forEdge(request, serverBuild.assets.version));
      const drawn = page.headers.get('Server-Timing');
      return withTiming(page, `page;dur=${Math.round(performance.now() - started)}${drawn ? `, ${drawn}` : ''}`);
    }
    const timing = pageTiming();
    const send = env.API ? env.API.fetch.bind(env.API) : (input: string, init?: RequestInit) => fetch(input, init);
    const page = await draw(request, env, { fetch: timing.timed(send) }, (work) => ctx.waitUntil(work));
    return withTiming(page, timing.header(performance.now() - started));
  },
};
