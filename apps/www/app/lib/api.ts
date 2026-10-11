import { ChassidusHub } from '@chassidushub/client';

declare module 'react-router' {
  interface AppLoadContext {
    /** The ChassidusHub API, for a page's loader (server/worker.ts, server/node.ts). */
    api: ChassidusHub;
    /**
     * The API as the person asking: their session cookie goes with each call.
     * Only for what they do themselves (a fix, its undo), never for reading a
     * page, so no page is ever drawn for one person and kept for another.
     */
    visitor?: ChassidusHub;
    /**
     * A request sent on to the API as it came (its method, body, cookie and
     * Origin), for signing in only (routes/auth.ts): the API sets the session
     * cookie on its answer, and the site hands that to the browser as its own.
     */
    forward?: (path: string, request: Request) => Promise<Response>;
  }
}

type Binding = { fetch(input: string, init?: RequestInit): Promise<Response> };

/**
 * The API for this request: through the Worker's service binding when there is
 * one (inside Cloudflare, no public round trip), else over HTTPS to `baseUrl`.
 * With `cookie`, it goes as the person whose browser sent it.
 */
export function apiFor({ binding, baseUrl, cookie }: { binding?: Binding; baseUrl?: string; cookie?: string | null }): ChassidusHub {
  const send = binding ? (input: string, init?: RequestInit) => binding.fetch(input, init) : undefined;
  const asPerson = cookie
    ? (input: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('cookie', cookie);
        return (send ?? fetch)(input, { ...init, headers });
      }
    : undefined;
  return new ChassidusHub({ baseUrl, fetch: asPerson ?? send, userAgent: 'chassidushub-www' });
}

/** The API as the person asking, only when their browser sent a cookie: without one, nobody is signed in and there is nothing to send as them. */
export function visitorApi(request: Request, make: (cookie: string) => ChassidusHub): ChassidusHub | undefined {
  const cookie = request.headers.get('cookie');
  return cookie ? make(cookie) : undefined;
}

/** The headers a request to sign in carries on to the API; nothing else of the browser's goes. */
const FORWARDED = ['accept', 'content-type', 'cookie', 'origin', 'user-agent'];

/** Sends a browser's request on to the API's `path`, through the binding when there is one (AppLoadContext.forward). */
export function forwardFor({ binding, baseUrl = 'https://api.chassidushub.org' }: { binding?: Binding; baseUrl?: string }) {
  return async (path: string, request: Request): Promise<Response> => {
    const headers = new Headers();
    for (const name of FORWARDED) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    // The API sets a Secure cookie only for a request it knows came over HTTPS.
    if (new URL(request.url).protocol === 'https:') headers.set('x-forwarded-proto', 'https');
    // The address Cloudflare saw the person at (a browser cannot write it), for the API's hourly limits on reports and takedowns.
    const address = request.headers.get('cf-connecting-ip');
    if (address) headers.set('x-forwarded-for', address);
    const query = new URL(request.url).search;
    const init: RequestInit = { method: request.method, headers, redirect: 'manual', ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: await request.text() }) };
    const url = `${baseUrl.replace(/\/+$/, '')}${path}${query}`;
    return binding ? binding.fetch(url, init) : fetch(url, init);
  };
}
