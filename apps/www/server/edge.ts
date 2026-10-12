/**
 * Pages kept at Cloudflare's edge for days, so a page opens at once for every
 * reader after the first, from any country (docs/operations.md, "The new
 * site's pages at the edge").
 *
 * The Workers cache sits in front of the site's `CachedPage` entrypoint
 * (wrangler.toml, [exports]) and is tiered: a page drawn once anywhere is
 * kept near the reader and in an upper tier every data centre asks first.
 * A page says it may be kept by its route's Cache-Control (`public` with an
 * `s-maxage`, app/lib/caching.ts); pages drawn for one person say `private`.
 *
 * A kept page is forgotten when a Suggestion that changes what it shows is
 * approved. Each page is tagged with the id of every item its reads of the
 * API answered about (`seenIn`, `tagged`), and the API, once a minute, tells
 * `CachedPage` which items changed (services/api/src/pages.ts,
 * `forgetChangedPages`), which forgets every page tagged with one of them.
 */

/** The session cookie the API sets for the site (services/api/src/auth.ts). */
const SIGNED_IN = /(?:^|;\s*)(?:__Host-)?rh_session=/;

/** Addresses that pass a person's own requests on to the API (sign-in, connecting an app): never from the edge. */
const PASSAGES = /^\/(_|oauth|auth)\//;

/** Links shared on social sites and in newsletters carry these; the page is the same without them. */
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src)$/i;

/** An item's id in an API answer (packages/model/src/ids.ts). */
const ITEM_ID = /"(rh-[0-9a-hjkmnp-tv-z]{6,16})"/g;

/**
 * The most tags a kept page carries: Cloudflare keeps up to 1000 on a
 * response. A page that read about more items than that, or was still
 * reading when it went out, cannot be forgotten item by item, so it is kept
 * for `BRIEF_SECONDS` only.
 */
export const MOST_TAGS = 1000;
export const BRIEF_SECONDS = 600;

/**
 * Whether a request may be answered from the kept pages: a GET or HEAD from
 * someone not signed in (they may have just fixed the page, and should see it
 * as it now is), not a hard reload, and not one of the passages.
 */
export function mayUseEdge(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (SIGNED_IN.test(request.headers.get('Cookie') ?? '')) return false;
  if (/no-cache|no-store/i.test(request.headers.get('Cache-Control') ?? '')) return false;
  return !PASSAGES.test(new URL(request.url).pathname);
}

/**
 * The request as the edge should see it: without tracking parameters, so a
 * link shared a thousand ways is one kept page; without cookies, which no
 * kept page reads (Home's "continue" is drawn in the browser, app/lib/stopped.ts);
 * and partitioned by the site's address and its build.
 *
 * The cache is shared by every deploy of the Worker (cross_version_cache in
 * wrangler.toml), so a deploy that changes nothing a page shows keeps the
 * pages warm. A kept page names the build's scripts by their hashed file
 * names, which a new build no longer has, so pages are kept per build of the
 * browser's code (`build`, React Router's assets version), and per address,
 * since the beta and the real address draw different pages (app/lib/site.ts).
 */
export function forEdge(request: Request, build: string): Request {
  const url = new URL(request.url);
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  const headers = new Headers(request.headers);
  headers.delete('Cookie');
  headers.set('Cloudflare-Workers-Version-Key', `${url.host}|${build}`);
  return new Request(url.toString(), { method: request.method, headers, redirect: 'manual' });
}

/** The ids of the items one API answer is about, from its JSON. */
export function idsIn(json: string, into: Set<string> = new Set()): Set<string> {
  for (const found of json.matchAll(ITEM_ID)) into.add(found[1]!);
  return into;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** The items a page's reads of the API answered about, and how many of its reads have not yet been read through. */
export class Seen {
  readonly ids = new Set<string>();
  open = 0;
}

/**
 * A fetch that notes, in `seen`, the id of every item the API's answers name.
 * It reads a copy of each JSON answer beside the page, so the page waits for
 * nothing more. A read is open from when it is asked until its copy is read.
 */
export function seenIn(send: Fetch, seen: Seen): Fetch {
  return async (input, init) => {
    seen.open++;
    let response: Response;
    try {
      response = await send(input, init);
    } catch (error) {
      seen.open--;
      throw error;
    }
    if (response.ok && (response.headers.get('Content-Type') ?? '').includes('json')) {
      void response
        .clone()
        .text()
        .then((json) => void idsIn(json, seen.ids))
        .catch(() => undefined)
        .finally(() => seen.open--);
    } else seen.open--;
    return response;
  };
}

/** Whether a page's Cache-Control lets the edge keep it: a page, or a page that moved (a redirect is tagged like one). */
export function keepable(response: Response): boolean {
  const said = response.headers.get('Cache-Control') ?? '';
  return (response.status === 200 || (response.status >= 300 && response.status < 400)) && !response.headers.has('Set-Cookie') && /(?:^|,)\s*public\b/i.test(said) && /s-maxage=\d+/i.test(said) && !/private|no-store/i.test(said);
}

/**
 * The page as it is kept, with its Cache-Tag: one tag for each item it read
 * about, so it is forgotten when one of them changes. It goes out at once,
 * streaming as it was drawn (pages load instantly, even for the first
 * reader). A page still reading the API when its first bytes go (its
 * `<Await>` parts) cannot name everything it will show, and a page that read
 * about too many items to tag cannot be forgotten item by item: both are kept
 * briefly instead. One that failed or is missing is not kept at all.
 */
export async function tagged(response: Response, seen: Seen): Promise<Response> {
  if (!keepable(response)) return response.status >= 400 || !response.headers.has('Cache-Control') ? unkept(response) : response;
  // A copy of an answer the page has already read through is read in a moment; wait for those, not for the page's open reads.
  await new Promise((done) => setTimeout(done, 0));
  const headers = new Headers(response.headers);
  if (seen.open > 0 || seen.ids.size > MOST_TAGS) {
    headers.set('Cache-Control', headers.get('Cache-Control')!.replace(/s-maxage=(\d+)/i, (_, s: string) => `s-maxage=${Math.min(Number(s), BRIEF_SECONDS)}`));
  }
  if (seen.ids.size > 0 && seen.ids.size <= MOST_TAGS) headers.set('Cache-Tag', [...seen.ids].join(','));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * A page the edge must not keep: one that failed or is not there (an item
 * may be added at that address any minute, and nothing would forget it),
 * and one that did not say.
 */
function unkept(response: Response): Response {
  const out = new Response(response.body, response);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}

/** The tags `forget` is given at most at once: Cloudflare takes 100 in one purge. */
export const TAGS_AT_ONCE = 100;

/** The ids to forget, in groups Cloudflare takes in one purge. */
export function inGroups(ids: string[]): string[][] {
  const valid = [...new Set(ids.filter((id) => /^rh-[0-9a-hjkmnp-tv-z]{6,16}$/.test(id)))];
  const groups: string[][] = [];
  for (let i = 0; i < valid.length; i += TAGS_AT_ONCE) groups.push(valid.slice(i, i + TAGS_AT_ONCE));
  return groups;
}
