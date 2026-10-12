import { describe, expect, it } from 'vitest';
import { cachedPage, keepable, mayKeep, type PageStore } from '../server/pageCache.js';

/** A Workers cache in memory: what was put, by address. */
function memoryStore(): PageStore & { kept: Map<string, Response> } {
  const kept = new Map<string, Response>();
  return {
    kept,
    async match(request) {
      return kept.get(request.url)?.clone();
    },
    async put(request, response) {
      kept.set(request.url, new Response(await response.text(), response));
    },
  };
}

const page = (cacheControl: string, body = 'page', init: ResponseInit = {}) => new Response(body, { status: 200, ...init, headers: { 'Cache-Control': cacheControl, ...(init.headers as Record<string, string>) } });
const PUBLIC = 'public, max-age=0, s-maxage=120, stale-while-revalidate=3600';

/** Runs the page cache once, waiting for what it does after answering. */
async function ask(store: PageStore, request: Request, draw: () => Promise<Response>, now: number) {
  const later: Promise<unknown>[] = [];
  const response = await cachedPage(request, store, draw, (work) => later.push(work), () => now);
  const body = await response.text();
  await Promise.all(later);
  return { response, body };
}

describe('the page cache', () => {
  it('keeps only a public page with an s-maxage, never one that sets a cookie or failed', () => {
    expect(keepable(page(PUBLIC))).toEqual({ fresh: 120, stale: 3600 });
    expect(keepable(page('private, no-cache'))).toBeNull();
    expect(keepable(page('public, max-age=60'))).toBeNull();
    expect(keepable(page(PUBLIC, 'x', { headers: { 'Set-Cookie': 'a=b' } }))).toBeNull();
    expect(keepable(new Response('gone', { status: 404, headers: { 'Cache-Control': PUBLIC } }))).toBeNull();
  });

  it('answers everyone from it but someone signed in, and not a reload', () => {
    expect(mayKeep(new Request('https://x/a', { headers: { Cookie: 'ch_read=%7B%7D' } }))).toBe(true);
    expect(mayKeep(new Request('https://x/a', { headers: { Cookie: 'ch_read=1; __Host-rh_session=abc' } }))).toBe(false);
    expect(mayKeep(new Request('https://x/a', { headers: { 'Cache-Control': 'no-cache' } }))).toBe(false);
    expect(mayKeep(new Request('https://x/a', { method: 'POST' }))).toBe(false);
  });

  it('draws a page once, answers the next reader from the edge, and draws it again behind a stale one', async () => {
    const store = memoryStore();
    let drawn = 0;
    const draw = async () => page(PUBLIC, `drawn ${++drawn}`);
    const request = () => new Request('https://new.chassidushub.org/likkutei-sichos/1/1', { headers: { Cookie: 'ch_read=1' } });

    expect((await ask(store, request(), draw, 0)).body).toBe('drawn 1');
    const second = await ask(store, request(), draw, 60_000);
    expect(second.body).toBe('drawn 1');
    expect(second.response.headers.get('Cache-Control')).toBe(PUBLIC);
    expect(second.response.headers.get('Age')).toBe('60');
    expect(second.response.headers.get('Server-Timing')).toBe('edge;desc="kept, 60s old"');
    expect(drawn).toBe(1);

    // Past two minutes: the kept page at once, a fresh one drawn behind it for the next reader.
    expect((await ask(store, request(), draw, 200_000)).body).toBe('drawn 1');
    expect(drawn).toBe(2);
    expect((await ask(store, request(), draw, 201_000)).body).toBe('drawn 2');
  });

  it('never keeps a private page, and draws for someone signed in', async () => {
    const store = memoryStore();
    await ask(store, new Request('https://x/'), async () => page('private, no-cache'), 0);
    expect(store.kept.size).toBe(0);
    await ask(store, new Request('https://x/a'), async () => page(PUBLIC, 'kept'), 0);
    const signedIn = await ask(store, new Request('https://x/a', { headers: { Cookie: '__Host-rh_session=1' } }), async () => page(PUBLIC, 'fresh'), 1000);
    expect(signedIn.body).toBe('fresh');
  });
});
