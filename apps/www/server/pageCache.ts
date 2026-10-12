/**
 * Pages kept at Cloudflare's edge, so a page someone opened a minute ago
 * opens at once for the next reader instead of being drawn again.
 *
 * A page says it may be kept by its route's Cache-Control: `public` with an
 * `s-maxage` (how long it is fresh) and a `stale-while-revalidate` (how long
 * after that it may still be shown while a fresh one is drawn behind it).
 * Pages drawn from someone's cookies (Home's "continue", Listen) say
 * `private` and are never kept. Pages are the same for everyone (who is
 * signed in is asked by the browser, app/lib/account.ts), so they are kept
 * by their address alone, whatever cookies came with them. Someone signed
 * in always gets a page drawn now: they may have just fixed its words.
 */

/** The parts of the Workers cache this uses (caches.default). */
export interface PageStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** The session cookie the API sets for the site (services/api/src/auth.ts). */
const SIGNED_IN = /(?:^|;\s*)(?:__Host-)?rh_session=/;

/** When a kept page was drawn, and the route's own Cache-Control, carried on the kept copy. */
const DRAWN = 'X-Page-Drawn';
const ROUTE_CACHE = 'X-Page-Cache-Control';

/** Seconds from a Cache-Control directive, or null when it is not there. */
function seconds(cacheControl: string, name: string): number | null {
  const found = new RegExp(`(?:^|,)\\s*${name}=(\\d+)`, 'i').exec(cacheControl);
  return found ? Number(found[1]) : null;
}

/** How long a page may be kept: fresh for `fresh` seconds, then shown stale for `stale` more. Null when it may not be kept. */
export function keepable(response: Response): { fresh: number; stale: number } | null {
  if (response.status !== 200 || response.headers.has('Set-Cookie')) return null;
  const cacheControl = response.headers.get('Cache-Control') ?? '';
  if (!/(?:^|,)\s*public\b/i.test(cacheControl) || /no-store|private/i.test(cacheControl)) return null;
  const fresh = seconds(cacheControl, 's-maxage');
  if (!fresh) return null;
  return { fresh, stale: seconds(cacheControl, 'stale-while-revalidate') ?? 0 };
}

/** Whether this request may be answered from, and fill, the kept pages. */
export function mayKeep(request: Request): boolean {
  if (request.method !== 'GET') return false;
  if (SIGNED_IN.test(request.headers.get('Cookie') ?? '')) return false;
  // A hard reload asks for the page drawn now.
  return !/no-cache|no-store/i.test(request.headers.get('Cache-Control') ?? '');
}

/**
 * The page for `request`: a kept one when there is one (drawn again behind
 * it once it is no longer fresh), else drawn by `draw` and kept if its
 * route allows. `later` keeps work going after the answer has gone
 * (ctx.waitUntil). `now` is for tests.
 */
export async function cachedPage(
  request: Request,
  store: PageStore,
  draw: (request: Request) => Promise<Response>,
  later: (work: Promise<unknown>) => void,
  now: () => number = Date.now,
): Promise<Response> {
  if (!mayKeep(request)) return draw(request);
  const key = new Request(request.url, { method: 'GET' });
  const keep = async (response: Response) => {
    const allowed = keepable(response);
    if (!allowed) return;
    const headers = new Headers(response.headers);
    headers.set(DRAWN, String(now()));
    headers.set(ROUTE_CACHE, response.headers.get('Cache-Control')!);
    // The edge keeps it through its stale time too; whether it is still fresh is worked out from DRAWN.
    headers.set('Cache-Control', `public, s-maxage=${allowed.fresh + allowed.stale}`);
    await store.put(key, new Response(response.body, { status: response.status, headers }));
  };
  const kept = await store.match(key).catch(() => undefined);
  if (kept) {
    const routeCache = kept.headers.get(ROUTE_CACHE) ?? '';
    const age = (now() - Number(kept.headers.get(DRAWN) ?? 0)) / 1000;
    const fresh = seconds(routeCache, 's-maxage') ?? 0;
    if (age > fresh) later(draw(request).then(keep).catch(() => undefined));
    const headers = new Headers(kept.headers);
    headers.delete(DRAWN);
    headers.delete(ROUTE_CACHE);
    headers.set('Cache-Control', routeCache);
    headers.set('Age', String(Math.max(0, Math.floor(age))));
    // Drawn earlier, so the API was not asked now: its timing then would mislead (server/serverTiming.ts).
    headers.set('Server-Timing', `edge;desc="kept, ${Math.max(0, Math.floor(age))}s old"`);
    return new Response(kept.body, { status: kept.status, headers });
  }
  const response = await draw(request);
  if (keepable(response)) later(keep(response.clone()).catch(() => undefined));
  return response;
}
