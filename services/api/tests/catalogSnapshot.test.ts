import { describe, expect, it } from 'vitest';
import { memorySnapshotStore, refreshSnapshot, type SnapshotManifest, type SnapshotTree } from '@chassidushub/core';
import { createApp } from '../src/app.js';
import { answeredHere } from '../src/reads.js';
import { singleFlight } from '../src/catalogSnapshot.js';
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
