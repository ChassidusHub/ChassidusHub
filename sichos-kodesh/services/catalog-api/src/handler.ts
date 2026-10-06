import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleRequest } from './router';

/**
 * The one Vercel function behind api.sk.shmuky.dev. vercel.json rewrites
 * every path here; `req.url` still carries the original path, so the
 * router sees `/v1/catalog/manifest.json`, not `/api/index`. The origin
 * is taken from the forwarded host so a preview deployment's manifest
 * points at that preview's own catalog.json, never at production.
 *
 * The source lives here rather than in api/ because Vercel only ever
 * sees the bundled output: scripts/build.mjs bundles this file (with the
 * router and the generated release data) into the single self-contained
 * api/index.js that Vercel deploys. Keeping the source out of api/ means
 * the directory never holds both index.ts and index.js at once.
 */
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
  const proto = first(req.headers['x-forwarded-proto']) ?? 'https';
  const host = first(req.headers['x-forwarded-host']) ?? first(req.headers.host) ?? 'api.sk.shmuky.dev';
  const origin = `${proto}://${host}`;
  const path = new URL(req.url ?? '/', origin).pathname;
  const method = req.method ?? 'GET';

  const result = handleRequest(method, path, origin);
  res.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  if (result.body && method.toUpperCase() !== 'HEAD') {
    res.end(Buffer.from(result.body));
  } else {
    if (result.body) res.setHeader('Content-Length', String(result.body.byteLength));
    res.end();
  }
}
