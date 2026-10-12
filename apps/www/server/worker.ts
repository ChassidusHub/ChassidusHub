import { createRequestHandler, type ServerBuild } from 'react-router';
import { apiFor, forwardFor, visitorApi } from '../app/lib/api';
import { pageContext } from '../app/serverOnly';
import { cachedPage, type PageStore } from './pageCache';
import { pageTiming, withTiming } from './serverTiming';
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

/**
 * The new site on Cloudflare Workers. Built files (build/client) are answered
 * by the Workers assets binding before this runs (wrangler.toml); everything
 * else is a page, rendered here.
 */
const handler = createRequestHandler(build as unknown as ServerBuild);

/** The Workers cache, when there is one (not in tests or on Node). */
const edge = (): PageStore | undefined => (globalThis as { caches?: { default?: PageStore } }).caches?.default;

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(work: Promise<unknown>): void }): Promise<Response> {
    const started = performance.now();
    // Every page says how long it took and what it waited on, in its Server-Timing (server/serverTiming.ts).
    const timing = pageTiming();
    const send = env.API ? env.API.fetch.bind(env.API) : (input: string, init?: RequestInit) => fetch(input, init);
    const binding = { fetch: timing.timed(send) };
    const draw = async (asked: Request) => {
      const page = await handler(asked, {
        api: apiFor({ binding, baseUrl: env.API_URL }),
        visitor: visitorApi(asked, (cookie) => apiFor({ binding, baseUrl: env.API_URL, cookie })),
        forward: forwardFor({ binding: env.API, baseUrl: env.API_URL }),
        showcases: env.FILES_PUBLIC ? bucketShowcases(env.FILES_PUBLIC) : undefined,
        ...pageContext(asked),
      });
      return withTiming(page, timing.header(performance.now() - started));
    };
    // A page anyone may have is kept at the edge (server/pageCache.ts), which says so in its timing.
    const store = edge();
    if (!store) return draw(request);
    const page = await cachedPage(request, store, draw, (work) => ctx.waitUntil(work));
    const kept = page.headers.get('Server-Timing');
    return kept?.startsWith('edge') ? withTiming(page, `page;dur=${Math.round(performance.now() - started)}, ${kept}`) : page;
  },
};
