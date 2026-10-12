import { describe, expect, it } from 'vitest';
import { memorySnapshotStore, refreshSnapshot, type SnapshotIndex, type SnapshotManifest, type SnapshotTopFile, type SnapshotTree } from '@chassidushub/core';
import { createApp } from '../src/app.js';
import { answeredHere } from '../src/reads.js';
import { r2SnapshotStore } from '../src/catalogSnapshot.js';
import type { R2Bucket } from '../src/r2.js';
import { add, freshCatalog } from '../../../packages/core/tests/helpers.js';

/**
 * The catalog snapshot at its addresses (catalogSnapshot.ts): a manifest kept
 * a minute that names files kept for good; on the Worker a new snapshot is
 * built by the scheduled run, never behind a request.
 */

const work = (set: string, he: string, slug: string) => ({ title: { he }, slug, authors: [], genre: 'sichos', levels: ['volume'], sets: [set] });

describe('GET /v1/catalog', () => {
  it('serves the manifest and the files it names, with their caching', async () => {
    const { catalog, set } = await freshCatalog();
    const sefer = await add(catalog, 'mendy', 'keeper', 'work', work(set, 'ספר', 'sefer'), '/sefer');
    const app = createApp({ catalog, catalogSnapshot: { store: memorySnapshotStore() } });

    const res = await app.request('https://api.example/v1/catalog/manifest.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=60');
    const manifest = (await res.json()) as SnapshotManifest;
    expect(manifest.base).toBe('https://api.example/v1/catalog/files/');
    expect(res.headers.get('X-Catalog-Version')).toBe(manifest.version);

    const file = await app.request(`${manifest.base}${manifest.tree.file}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('Cache-Control')).toContain('immutable');
    const text = await file.text();
    expect(new TextEncoder().encode(text).byteLength).toBe(manifest.tree.bytes);
    expect((JSON.parse(text) as SnapshotTree).works[sefer]!.path).toBe('/sefer');

    const again = await app.request(`${manifest.base}${manifest.tree.file}`, { headers: { 'If-None-Match': file.headers.get('ETag')! } });
    expect(again.status).toBe(304);
    expect((await app.request(`${manifest.base}tree.0000000000000000.json`)).status).toBe(404);
    expect((await app.request(`${manifest.base}..%2Fmanifest.json`)).status).toBe(404);
  });

  it('serves the index, the files’ names only, with the manifest’s caching', async () => {
    const { catalog, set } = await freshCatalog();
    await add(catalog, 'mendy', 'keeper', 'work', work(set, 'ספר', 'sefer'), '/sefer');
    const app = createApp({ catalog, catalogSnapshot: { store: memorySnapshotStore() } });
    const res = await app.request('https://api.example/v1/catalog/index.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=60');
    const index = (await res.json()) as SnapshotIndex;
    expect(res.headers.get('X-Catalog-Version')).toBe(index.version);
    const top = (await (await app.request(`https://api.example/v1/catalog/files/${index.top}`)).json()) as SnapshotTopFile;
    expect(top.top.map((s) => s.id)).toEqual(Object.keys(index.shelves));
  });

  it('never builds behind a request when the scheduled run builds: the kept one is served until the run', async () => {
    const { catalog, set } = await freshCatalog();
    await add(catalog, 'mendy', 'keeper', 'work', work(set, 'ספר', 'sefer'), '/sefer');
    const store = memorySnapshotStore();
    const background: Array<Promise<unknown>> = [];
    const app = createApp({ catalog, catalogSnapshot: { store, scheduled: true }, waitUntil: (w) => void background.push(w) });

    // None yet: 503 until the run has built one, and nothing started behind the answer.
    const none = await app.request('/v1/catalog/manifest.json');
    expect(none.status).toBe(503);
    expect(none.headers.get('Retry-After')).toBe('60');
    expect(none.headers.get('Cache-Control')).toBe('no-store');
    expect((await app.request('/v1/catalog/index.json')).status).toBe(503);
    expect(background).toHaveLength(0);

    await refreshSnapshot(catalog.db, store);
    const first = (await (await app.request('/v1/catalog/manifest.json')).json()) as SnapshotManifest;

    // A change, and a write through the API: the manifest is still the old one, and no build was started.
    await add(catalog, 'mendy', 'keeper', 'work', work(set, 'עוד ספר', 'od-sefer'), '/od-sefer');
    await app.request('/v1/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'other', note: 'x' }) });
    expect(((await (await app.request('/v1/catalog/manifest.json')).json()) as SnapshotManifest).seq).toBe(first.seq);
    expect(background).toHaveLength(0);

    // The scheduled run builds it.
    await refreshSnapshot(catalog.db, store);
    const fresh = (await (await app.request('/v1/catalog/manifest.json')).json()) as SnapshotManifest;
    expect(fresh.seq).toBeGreaterThan(first.seq);
    expect(fresh.counts.works).toBe(first.counts.works + 1);
  });

  it('with no scheduled run (local work), builds the snapshot when main moved on, and the answer waits', async () => {
    const { catalog, set } = await freshCatalog();
    await add(catalog, 'mendy', 'keeper', 'work', work(set, 'ספר', 'sefer'), '/sefer');
    const app = createApp({ catalog, catalogSnapshot: { store: memorySnapshotStore() } });
    const first = (await (await app.request('/v1/catalog/manifest.json')).json()) as SnapshotManifest;
    await add(catalog, 'mendy', 'keeper', 'work', work(set, 'עוד ספר', 'od-sefer'), '/od-sefer');
    const fresh = (await (await app.request('/v1/catalog/manifest.json')).json()) as SnapshotManifest;
    expect(fresh.seq).toBeGreaterThan(first.seq);
  });

  it('is asked of the API, not answered in the site’s Worker', () => {
    expect(answeredHere('https://api.example/v1/catalog/manifest.json', undefined, 'https://api.example', true)).toBe(false);
  });
});

/** A bucket in memory that keeps etags and honours `onlyIf`, as R2 does. */
function etagBucket(): R2Bucket {
  const kept = new Map<string, { text: string; etag: string }>();
  let n = 0;
  return {
    async get(key) {
      const object = kept.get(key);
      return object ? { body: new Response(object.text).body!, size: object.text.length, etag: object.etag, text: async () => object.text } : null;
    },
    async put(key, value, options) {
      if (options?.onlyIf && kept.get(key)?.etag !== options.onlyIf.etagMatches) return null;
      kept.set(key, { text: String(value), etag: `e${++n}` });
      return {};
    },
  };
}

describe('r2SnapshotStore claim', () => {
  it('lets one isolate build at a time, and a dead build go after its time (#288)', async () => {
    const bucket = etagBucket();
    const a = r2SnapshotStore(bucket);
    const b = r2SnapshotStore(bucket);
    const soon = () => new Date(Date.now() + 60_000);
    const token = await a.claim!(soon());
    expect(token).toBeTruthy();
    expect(await b.claim!(soon())).toBeNull();
    // Only its holder hands it back.
    await b.release!('someone else');
    expect(await b.claim!(soon())).toBeNull();
    await a.release!(token!);
    const next = await b.claim!(new Date(Date.now() - 1));
    expect(next).toBeTruthy();
    // A claim whose time is up is taken over, though never handed back.
    expect(await a.claim!(soon())).toBeTruthy();

    // Two isolates that ask together, before any claim was ever written and after one was handed back: one gets it.
    const used = etagBucket();
    const once = r2SnapshotStore(used);
    await once.release!((await once.claim!(soon()))!);
    for (const shared of [etagBucket(), used]) {
      const won = await Promise.all([r2SnapshotStore(shared).claim!(soon()), r2SnapshotStore(shared).claim!(soon())]);
      expect(won.filter(Boolean)).toHaveLength(1);
    }
  });
});
