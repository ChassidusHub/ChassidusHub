import { describe, expect, it } from 'vitest';
import { bucketFiles, catalogFile } from '../server/catalog.js';

/** `/_/catalog/<file>`: the snapshot's files from this site's own address (server/catalog.ts). */

const bucket = (kept: Record<string, string>) => bucketFiles({ get: async (key) => (key in kept ? { body: null, text: async () => kept[key]! } : null) });

describe('/_/catalog', () => {
  it('serves the index and the manifest a minute, and a file for good', async () => {
    const files = bucket({ 'catalog/index.json': '{"format":2}', 'catalog/manifest.json': '{"format":1}', 'catalog/files/top.0123456789abcdef.json': '{}' });
    const index = (await catalogFile(new Request('https://new.example/_/catalog/index.json'), files))!;
    expect(index.status).toBe(200);
    expect(index.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=60');
    expect(await index.text()).toBe('{"format":2}');
    expect((await catalogFile(new Request('https://new.example/_/catalog/manifest.json'), files))!.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=60');
    expect((await catalogFile(new Request('https://new.example/_/catalog/top.0123456789abcdef.json'), files))!.headers.get('Cache-Control')).toContain('immutable');
    expect((await catalogFile(new Request('https://new.example/_/catalog/index.json'), bucket({})))!.status).toBe(404);
  });
});
