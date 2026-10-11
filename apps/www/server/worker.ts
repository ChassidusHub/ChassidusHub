import { createRequestHandler, type ServerBuild } from 'react-router';
import { apiFor, visitorApi } from '../app/lib/api';
import { pageContext } from '../app/serverOnly';
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

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handler(request, {
      api: apiFor({ binding: env.API, baseUrl: env.API_URL }),
      visitor: visitorApi(request, (cookie) => apiFor({ binding: env.API, baseUrl: env.API_URL, cookie })),
      ...pageContext(request),
    });
  },
};
