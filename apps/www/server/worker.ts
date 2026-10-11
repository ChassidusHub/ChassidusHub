import { createRequestHandler, type ServerBuild } from 'react-router';
import { apiFor, forwardFor, visitorApi } from '../app/lib/api';
import { pageContext } from '../app/serverOnly';
import { cachedPage, type PageStore } from './pageCache';
// @ts-ignore - made by `react-router build`
import * as build from '../build/server/index.js';

interface Env {
  /** The API Worker, reached inside Cloudflare (wrangler.toml). */
  API?: { fetch(input: string, init?: RequestInit): Promise<Response> };
  /** The API's public address, used only when the binding is absent. */
  API_URL?: string;
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
  fetch(request: Request, env: Env, ctx: { waitUntil(work: Promise<unknown>): void }): Promise<Response> {
    const draw = (asked: Request) =>
      handler(asked, {
        api: apiFor({ binding: env.API, baseUrl: env.API_URL }),
        visitor: visitorApi(asked, (cookie) => apiFor({ binding: env.API, baseUrl: env.API_URL, cookie })),
        forward: forwardFor({ binding: env.API, baseUrl: env.API_URL }),
        ...pageContext(asked),
      });
    // A page anyone may have is kept at the edge (server/pageCache.ts).
    const store = edge();
    return store ? cachedPage(request, store, draw, (work) => ctx.waitUntil(work)) : draw(request);
  },
};
