import { handleRequest } from './router';

/**
 * The reader app's own catalog, as a Worker on the chassidushub.org
 * account (wrangler.toml), from the release data scripts/build.mjs bakes
 * in. It has no address of its own: the app asks ChassidusHub's API
 * (api.chassidushub.org/v1/app), which passes the catalog requests on here
 * over a service binding while its own release lacks a part the app shows
 * (services/api/src/appCatalog.ts there), and serves the texts and the
 * app's updates itself.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const result = handleRequest(method, url.pathname, url.origin);
    if (method === 'HEAD' && result.body) result.headers['Content-Length'] ??= String(result.body.byteLength);
    return new Response(method === 'HEAD' ? null : result.body, { status: result.status, headers: result.headers });
  },
};
