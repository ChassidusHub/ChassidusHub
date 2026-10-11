import { ChassidusHub } from '@chassidushub/client';

declare module 'react-router' {
  interface AppLoadContext {
    /** The ChassidusHub API, for a page's loader (server/worker.ts, server/node.ts). */
    api: ChassidusHub;
  }
}

/**
 * The API for this request: through the Worker's service binding when there is
 * one (inside Cloudflare, no public round trip), else over HTTPS to `baseUrl`.
 */
export function apiFor({ binding, baseUrl }: { binding?: { fetch(input: string, init?: RequestInit): Promise<Response> }; baseUrl?: string }): ChassidusHub {
  return new ChassidusHub({ baseUrl, fetch: binding ? (input, init) => binding.fetch(input, init) : undefined, userAgent: 'chassidushub-www' });
}
