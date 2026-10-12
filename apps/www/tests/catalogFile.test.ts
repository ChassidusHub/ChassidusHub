import { describe, expect, it } from 'vitest';
import { bucketFiles, catalogFile, indexKeeper } from '../server/catalog.js';

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

describe('the index each page carries', () => {
  const index = (body: unknown, status = 200) => ({ manifest: async () => new Response(null, { status: 404 }), index: async () => new Response(JSON.stringify(body), { status }), file: async () => new Response(null, { status: 404 }) });

  it('goes out without it until it has come, then with it, asked again a minute on', async () => {
    let now = 0;
    let asked = 0;
    const files = index({ format: 2, top: 'top.1.json', shelves: { a: 'shelf-a.1.json</script>' } });
    const counted = { ...files, index: () => (asked++, files.index()) };
    const kept = indexKeeper(counted, { now: () => now });
    const later: Promise<unknown>[] = [];
    expect(kept((work) => later.push(work))).toBeNull();
    await Promise.all(later);
    const text = kept()!;
    expect(JSON.parse(text).top).toBe('top.1.json');
    // It cannot end the page's script.
    expect(text).not.toContain('</script>');
    now = 30_000;
    kept();
    expect(asked).toBe(1);
    now = 61_000;
    kept();
    expect(asked).toBe(2);
  });

  it('carries no index of another format, nor one that failed', async () => {
    for (const files of [index({ format: 1 }), index({ format: 2 }, 500)]) {
      const kept = indexKeeper(files);
      const later: Promise<unknown>[] = [];
      kept((work) => later.push(work));
      await Promise.all(later);
      expect(kept()).toBeNull();
    }
  });
});
