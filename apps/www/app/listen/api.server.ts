/**
 * The API, read from the server while a page is put together. Only loaders use
 * this, so none of it reaches the browser. Answers are kept at Cloudflare's
 * edge for a few minutes (`cache`), so a page that many people open asks the
 * API once, and the server wait stays short.
 */
const API = 'https://api.chassidushub.org';

export class ApiMissing extends Error {}

export async function api<T>(path: string, { cache = 300 }: { cache?: number } = {}): Promise<T> {
  const init = { headers: { accept: 'application/json' }, cf: { cacheTtl: cache, cacheEverything: true } } as RequestInit;
  const response = await fetch(`${API}${path}`, init);
  if (response.status === 404) throw new ApiMissing(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

/** A 404 page when the API has no such item; anything else is the site's error page. */
export function notFound(error: unknown): never {
  if (error instanceof ApiMissing) throw new Response('not found', { status: 404 });
  throw error;
}
