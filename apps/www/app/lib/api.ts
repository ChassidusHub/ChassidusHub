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
