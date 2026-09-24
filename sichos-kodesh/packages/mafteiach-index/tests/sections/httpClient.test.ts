import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PoliteFetcher } from '../../src/httpClient.js';

describe('PoliteFetcher.fetchWithRevalidation', () => {
  let cacheDir: string;
  const fetchMock = vi.fn();

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'mafteiach-cache-'));
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('fetches once, re-reads from the cache without a request when revalidate is false, and sends If-None-Match otherwise', async () => {
    const fetcher = new PoliteFetcher({ cacheDir, userAgent: 'test', delayMs: 0 });
    const url = 'https://www.mafteiach.app/yomanim/by_year/5711.js';
    fetchMock.mockResolvedValueOnce(new Response('<div>page</div>', { status: 200, headers: { etag: 'W/"1"' } }));

    expect(await fetcher.fetchWithRevalidation(url)).toEqual({ body: '<div>page</div>', etag: 'W/"1"', changed: true });
    expect(await fetcher.fetchWithRevalidation(url, { revalidate: false })).toEqual({ body: '<div>page</div>', etag: 'W/"1"', changed: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    expect(await fetcher.fetchWithRevalidation(url)).toEqual({ body: '<div>page</div>', etag: 'W/"1"', changed: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toMatchObject({ 'If-None-Match': 'W/"1"' });
  });

  it('still fetches a URL never seen, even when revalidate is false', async () => {
    const fetcher = new PoliteFetcher({ cacheDir, userAgent: 'test', delayMs: 0 });
    fetchMock.mockResolvedValueOnce(new Response('new', { status: 200 }));
    expect(await fetcher.fetchWithRevalidation('https://www.mafteiach.app/x.js', { revalidate: false })).toMatchObject({ body: 'new', changed: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
