import { describe, expect, it } from 'vitest';
import worker from '../src/worker';
import { MANIFEST_PATH } from '../src/router';

const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://reader-catalog${path}`, init));

describe('the catalog Worker', () => {
  it('answers the catalog itself, pointing back at the address it was asked at', async () => {
    const response = await call(MANIFEST_PATH);
    expect(response.status).toBe(200);
    const manifest = (await response.json()) as { url: string };
    expect(manifest.url.startsWith('https://reader-catalog/v1/catalog/')).toBe(true);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('keeps crawlers out', async () => {
    expect(await (await call('/robots.txt')).text()).toBe('User-agent: *\nDisallow: /\n');
  });

  it('answers HEAD without a body', async () => {
    const response = await call(MANIFEST_PATH, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
});
