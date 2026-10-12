import { WorkerEntrypoint } from 'cloudflare:workers';
import { createRequestHandler, type ServerBuild } from 'react-router';
import { apiFor, forwardFor, visitorApi } from '../app/lib/api';
import { pageContext } from '../app/serverOnly';
import { forEdge, inGroups, mayUseEdge, Seen, seenIn, tagged } from './edge';
import { bucketShowcases, type ShowcaseBucket } from '../app/stewards/showcase';
// @ts-ignore - made by `react-router build`
import * as build from '../build/server/index.js';

interface Env {
  /** The API Worker, reached inside Cloudflare (wrangler.toml). */
  API?: { fetch(input: string, init?: RequestInit): Promise<Response> };
  /** The API's public address, used only when the binding is absent. */
  API_URL?: string;
  /** The public bucket, where showcases are kept (app/stewards/showcase.ts). */
  FILES_PUBLIC?: ShowcaseBucket;
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

/** A page drawn now. `binding` is how its loaders reach the API (as nobody: no cookie goes with a page's reads). */
function draw(request: Request, env: Env, binding: Binding | undefined): Promise<Response> {
  return handler(request, {
    api: apiFor({ binding, baseUrl: env.API_URL }),
    visitor: visitorApi(request, (cookie) => apiFor({ binding: env.API, baseUrl: env.API_URL, cookie })),
    forward: forwardFor({ binding: env.API, baseUrl: env.API_URL }),
    showcases: env.FILES_PUBLIC ? bucketShowcases(env.FILES_PUBLIC) : undefined,
    ...pageContext(request),
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
    return tagged(await draw(request, this.env, { fetch: seenIn(fresh, seen) }), seen);
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

export default {
  fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const cached = ctx.exports?.CachedPage;
    if (cached && mayUseEdge(request)) return cached.fetch(forEdge(request, serverBuild.assets.version));
    return draw(request, env, env.API);
  },
};
