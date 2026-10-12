import { describe, expect, it } from 'vitest';
import { CROWDED_SECONDS, forEdge, idsIn, inGroups, mayUseEdge, Seen, seenIn, tagged } from '../server/edge.js';
import { KEPT_PAGE, todaysPage } from '../app/lib/caching.js';

const page = (cacheControl: string, init: ResponseInit = {}) => new Response('<p>page</p>', { status: 200, ...init, headers: { 'Cache-Control': cacheControl, ...(init.headers as Record<string, string>) } });
/** The i-th made-up item id, in the ids' own letters (packages/model/src/ids.ts). */
const fakeId = (i: number) => `rh-${Array.from({ length: 8 }, (_, k) => '0123456789abcdefghjkmnpqrstvwxyz'[Math.floor(i / 32 ** k) % 32]).join('')}`;
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

describe("the site's pages at the edge", () => {
  it('serves from the edge only what anyone may have', () => {
    expect(mayUseEdge(new Request('https://new.chassidushub.org/library'))).toBe(true);
    expect(mayUseEdge(new Request('https://new.chassidushub.org/library', { headers: { Cookie: 'theme=dark; ch_read=%7B%7D' } }))).toBe(true);
    expect(mayUseEdge(new Request('https://new.chassidushub.org/library', { headers: { Cookie: '__Host-rh_session=abc' } }))).toBe(false);
    expect(mayUseEdge(new Request('https://new.chassidushub.org/library', { headers: { 'Cache-Control': 'no-cache' } }))).toBe(false);
    expect(mayUseEdge(new Request('https://new.chassidushub.org/fix', { method: 'POST' }))).toBe(false);
    expect(mayUseEdge(new Request('https://new.chassidushub.org/_/auth/session'))).toBe(false);
  });

  it('keeps one page for a link shared many ways, per address and build, without cookies', () => {
    const asked = forEdge(new Request('https://new.chassidushub.org/likkutei-sichos/5?utm_source=x&fbclid=y&q=1', { headers: { Cookie: 'ch_read=1' } }), 'b1');
    expect(asked.url).toBe('https://new.chassidushub.org/likkutei-sichos/5?q=1');
    expect(asked.headers.has('Cookie')).toBe(false);
    expect(asked.headers.get('Cloudflare-Workers-Version-Key')).toBe('new.chassidushub.org|b1');
  });

  it('finds the items an answer is about', () => {
    expect([...idsIn('{"id":"rh-7k2m9q4d","work":"rh-abcdefgh","title":"rh-not an id","n":"rh-ab"}')]).toEqual(['rh-7k2m9q4d', 'rh-abcdefgh']);
  });

  it('tags a kept page with every item its reads were about, those streamed after its first bytes too', async () => {
    const seen = new Seen();
    const send = seenIn(async (url) => json(url.endsWith('/a') ? { id: 'rh-aaaaaaaa' } : { items: [{ id: 'rh-bbbbbbbb' }] }), seen);
    await (await send('https://api/a')).json();
    // The page's first bytes go before its second read (<Await>); the page ends once that read is in.
    const body = new ReadableStream<Uint8Array>({
      async start(stream) {
        stream.enqueue(new TextEncoder().encode('<p>page'));
        await (await send('https://api/b')).json();
        stream.enqueue(new TextEncoder().encode('</p>'));
        stream.close();
      },
    });
    const response = await tagged(new Response(body, { headers: { 'Cache-Control': KEPT_PAGE } }), seen);
    expect(response.headers.get('Cache-Tag')?.split(',').sort()).toEqual(['rh-aaaaaaaa', 'rh-bbbbbbbb']);
    expect(await response.text()).toBe('<p>page</p>');
  });

  it('leaves pages for one person as they are, and keeps a page about too many items briefly', async () => {
    const seen = new Seen();
    seen.ids.add('rh-aaaaaaaa');
    const personal = page('private, no-cache');
    expect(await tagged(personal, seen)).toBe(personal);
    const crowded = new Seen();
    for (let i = 0; i < 1001; i++) crowded.ids.add(fakeId(i));
    const kept = await tagged(page(KEPT_PAGE), crowded);
    expect(kept.headers.has('Cache-Tag')).toBe(false);
    expect(kept.headers.get('Cache-Control')).toContain(`s-maxage=${CROWDED_SECONDS}`);
  });

  it('never keeps a page that failed, is missing, or did not say', async () => {
    const seen = new Seen();
    expect((await tagged(new Response('gone', { status: 404 }), seen)).headers.get('Cache-Control')).toBe('no-store');
    expect((await tagged(page(KEPT_PAGE, { status: 500 }), seen)).headers.get('Cache-Control')).toBe('no-store');
    expect((await tagged(new Response('?'), seen)).headers.get('Cache-Control')).toBe('no-store');
    seen.ids.add('rh-aaaaaaaa');
    const moved = await tagged(new Response(null, { status: 301, headers: { Location: '/new', 'Cache-Control': KEPT_PAGE } }), seen);
    expect(moved.headers.get('Cache-Tag')).toBe('rh-aaaaaaaa');
  });

  it('forgets in groups Cloudflare takes, ids only', () => {
    const ids = Array.from({ length: 250 }, (_, i) => fakeId(i));
    expect(inGroups([...ids, 'rh-NOTANID', ids[0]!]).map((g) => g.length)).toEqual([100, 100, 50]);
  });

  it('keeps Home and Listen until the day turns, an hour at most', () => {
    expect(todaysPage(new Date('2026-10-12T10:00:00Z'))).toContain('s-maxage=3600');
    expect(todaysPage(new Date('2026-10-12T23:50:00Z'))).toContain('s-maxage=600');
    expect(todaysPage(new Date('2026-10-12T23:59:59.5Z'))).toContain('s-maxage=60');
  });
});
