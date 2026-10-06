import { handleRequest } from './router';

/**
 * api.sk.chassidushub.org: the catalog API as a Cloudflare Worker on the
 * chassidushub.org account (wrangler.toml). The router answers the catalog
 * itself, from the release data scripts/build.mjs bakes in. Two things it
 * passes on, as Vercel's rewrites did before:
 *
 *   /v3/texts/<sha256>                 a sefer's text: ChassidusHub keeps the
 *                                      texts (this repository holds none), at
 *                                      /v1/app/v3/texts/<sha256> on its API
 *   /v1/app/android/latest.json,       the phone's own updates: the app
 *   /v1/app/android/download/<abi>     server, the pack API Worker
 *
 * Both go over service bindings, Worker to Worker on the same account; with
 * no binding (a local `wrangler dev`) they go to the public addresses.
 */
export interface Env {
  CHASSIDUSHUB_API?: Fetcher;
  PACK_API?: Fetcher;
}

const CHASSIDUSHUB_API = 'https://api.chassidushub.org';
const PACK_API = 'https://pack-api.sk.chassidushub.org';
const TEXT_PATH = /^\/v3\/texts\/([0-9a-f]{64})$/;
const APP_PATH = /^\/v1\/app\/android\/(latest\.json|download\/(?:arm64-v8a|armeabi-v7a|universal))$/;

/** The headers the apps have always had on a text: shown, never run, cached a year (the hash names it). */
const TEXT_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=86400, s-maxage=31536000',
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
};

const call = (binding: Fetcher | undefined, base: string, path: string, init?: RequestInit) =>
  binding ? binding.fetch(new Request(`${base}${path}`, init)) : fetch(`${base}${path}`, init);

async function text(sha256: string, env: Env, head: boolean): Promise<Response> {
  const kept = await call(env.CHASSIDUSHUB_API, CHASSIDUSHUB_API, `/v1/app/v3/texts/${sha256}`);
  if (!kept.ok) return new Response(JSON.stringify({ error: 'not_found', path: `/v3/texts/${sha256}` }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' } });
  return new Response(head ? null : kept.body, { status: 200, headers: TEXT_HEADERS });
}

/** The app server's answer as it is (a download keeps its Range, length and type), with the CORS the apps expect. */
async function app(path: string, request: Request, env: Env): Promise<Response> {
  const headers = new Headers();
  for (const name of ['Range', 'If-None-Match', 'If-Modified-Since']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const answer = await call(env.PACK_API, PACK_API, path, { method: request.method, headers, redirect: 'manual' });
  const response = new Response(answer.body, answer);
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    if (method === 'GET' || method === 'HEAD') {
      const textMatch = TEXT_PATH.exec(url.pathname);
      if (textMatch) return text(textMatch[1]!, env, method === 'HEAD');
      if (APP_PATH.test(url.pathname)) return app(url.pathname, request, env);
    }
    const result = handleRequest(method, url.pathname, url.origin);
    if (method === 'HEAD' && result.body) result.headers['Content-Length'] ??= String(result.body.byteLength);
    return new Response(method === 'HEAD' ? null : result.body, { status: result.status, headers: result.headers });
  },
};
