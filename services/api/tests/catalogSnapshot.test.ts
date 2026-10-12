import { describe, expect, it } from 'vitest';
import { memorySnapshotStore, refreshSnapshot, type SnapshotIndex, type SnapshotManifest, type SnapshotTopFile, type SnapshotTree } from '@chassidushub/core';
import { createApp } from '../src/app.js';
import { answeredHere } from '../src/reads.js';
import { r2SnapshotStore, singleFlight } from '../src/catalogSnapshot.js';
import type { R2Bucket } from '../src/r2.js';
import { add, freshCatalog } from '../../../packages/core/tests/helpers.js';

/**
 * The catalog snapshot at its addresses (catalogSnapshot.ts): a manifest kept
 * a minute that names files kept for good, and a new snapshot built behind
 * the answers once main has changed.
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

  it('builds a new snapshot behind the answer once main has changed', async () => {
    const { catalog, set } = await freshCatalog();
    await add(catalog, 'mendy', 'keeper', 'work', work(set, 'ספר', 'sefer'), '/sefer');
    const store = memorySnapshotStore();
    const background: Array<Promise<unknown>> = [];
    let builds = 0;
    const rebuild = singleFlight(async () => {
      builds++;
      await refreshSnapshot(catalog.db, store);
    });
    const app = createApp({ catalog, catalogSnapshot: { store, rebuild }, waitUntil: (work) => void background.push(work) });
    // None yet: 503, and the first snapshot is built behind it.
    expect((await app.request('/v1/catalog/manifest.json')).status).toBe(503);
    await Promise.all(background);
    builds = 0;
    const first = (await (await app.request('/v1/catalog/manifest.json')).json()) as SnapshotManifest;

    // A change: the next manifest is still the old one, and starts the build.
    await add(catalog, 'mendy', 'keeper', 'work', work(set, 'עוד ספר', 'od-sefer'), '/od-sefer');
    const stale = (await (await app.request('/v1/catalog/manifest.json')).json()) as SnapshotManifest;
    expect(stale.seq).toBe(first.seq);
    await Promise.all(background);
    expect(builds).toBe(1);
    const fresh = (await (await app.request('/v1/catalog/manifest.json')).json()) as SnapshotManifest;
    expect(fresh.seq).toBeGreaterThan(first.seq);
    expect(fresh.counts.works).toBe(first.counts.works + 1);
  });

  it('never builds while someone waits: with none yet, 503 and a build behind the answer', async () => {
    const { catalog, set } = await freshCatalog();
    await add(catalog, 'mendy', 'keeper', 'work', work(set, 'ספר', 'sefer'), '/sefer');
    const store = memorySnapshotStore();
    const background: Array<Promise<unknown>> = [];
    const rebuild = singleFlight(() => refreshSnapshot(catalog.db, store));
    const app = createApp({ catalog, catalogSnapshot: { store, rebuild }, waitUntil: (w) => void background.push(w) });

    const first = await app.request('/v1/catalog/manifest.json');
    expect(first.status).toBe(503);
    expect(first.headers.get('Retry-After')).toBe('30');
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect(background).toHaveLength(1);
    await Promise.all(background);
    expect((await app.request('/v1/catalog/manifest.json')).status).toBe(200);
    expect((await app.request('/v1/catalog/index.json')).status).toBe(200);
  });

  it('is asked of the API, not answered in the site’s Worker', () => {
    expect(answeredHere('https://api.example/v1/catalog/manifest.json', undefined, 'https://api.example', true)).toBe(false);
  });
});

describe('singleFlight', () => {
  it('runs one build at a time, and one more when asked meanwhile', async () => {
    let runs = 0;
    let release!: () => void;
    const build = singleFlight(() => {
      runs++;
      return runs === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve();
    });
    const a = build();
    const b = build();
    const c = build();
    release();
    await Promise.all([a, b, c]);
    expect(runs).toBe(2);
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
