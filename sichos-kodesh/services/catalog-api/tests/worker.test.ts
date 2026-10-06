import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/worker';
import { MANIFEST_PATH } from '../src/router';

const SHA = 'a'.repeat(64);

/** A service binding that answers from a function and records what it was asked. */
function binding(answer: (request: Request) => Response) {
  const asked: Request[] = [];
  const fetcher = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      asked.push(request);
      return answer(request);
    },
    connect: () => {
      throw new Error('not used');
    },
  } as unknown as Fetcher;
  return { fetcher, asked };
}

const call = (path: string, env: Env, init?: RequestInit) => worker.fetch(new Request(`https://api.sk.chassidushub.org${path}`, init), env);

describe('the catalog Worker', () => {
  it('answers the catalog itself, pointing back at its own address', async () => {
    const response = await call(MANIFEST_PATH, {});
    expect(response.status).toBe(200);
    const manifest = (await response.json()) as { url: string };
    expect(manifest.url.startsWith('https://api.sk.chassidushub.org/v1/catalog/')).toBe(true);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it("serves a text from ChassidusHub with the apps' headers", async () => {
    const chassidushub = binding(() => new Response('<article>שלום</article>', { headers: { 'Content-Security-Policy': 'sandbox' } }));
    const response = await call(`/v3/texts/${SHA}`, { CHASSIDUSHUB_API: chassidushub.fetcher });
    expect(new URL(chassidushub.asked[0]!.url).pathname).toBe(`/v1/app/v3/texts/${SHA}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<article>שלום</article>');
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'; style-src 'unsafe-inline'");
  });

  it('says not found for a text ChassidusHub does not have', async () => {
    const chassidushub = binding(() => new Response('{}', { status: 404 }));
    expect((await call(`/v3/texts/${SHA}`, { CHASSIDUSHUB_API: chassidushub.fetcher })).status).toBe(404);
  });

  it("passes the phone's update and download on to the app server, Range and all", async () => {
    const pack = binding((request) => new Response(`${new URL(request.url).pathname} ${request.headers.get('Range') ?? ''}`, { status: 206 }));
    expect(await (await call('/v1/app/android/latest.json', { PACK_API: pack.fetcher })).text()).toBe('/v1/app/android/latest.json ');
    const download = await call('/v1/app/android/download/arm64-v8a', { PACK_API: pack.fetcher }, { headers: { Range: 'bytes=10-' } });
    expect(download.status).toBe(206);
    expect(download.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await download.text()).toBe('/v1/app/android/download/arm64-v8a bytes=10-');
  });

  it('keeps crawlers out', async () => {
    expect(await (await call('/robots.txt', {})).text()).toBe('User-agent: *\nDisallow: /\n');
  });

  it('answers HEAD without a body', async () => {
    const response = await call(MANIFEST_PATH, {}, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
});
