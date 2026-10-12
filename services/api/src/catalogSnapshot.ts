import type { Context, Hono } from 'hono';
import { CatalogError, SNAPSHOT_CLAIM_KEY, SNAPSHOT_FILE_NAME, readIndex, readManifest, refreshSnapshot, snapshotFileKey, type Catalog, type SnapshotIndex, type SnapshotManifest, type SnapshotStore } from '@chassidushub/core';
import type { R2Bucket } from './r2.js';

/**
 * The catalog snapshot (core/catalogSnapshot.ts, docs/catalog-snapshot.md):
 * the shelves, sefarim, units and farbrengens as files the new site draws its
 * catalog pages from, in the Worker and in the browser, with no read of the
 * database for each page.
 *
 *   GET /v1/catalog/manifest.json      which files make up the snapshot now (kept a minute)
 *   GET /v1/catalog/index.json         the same, as the files' names only, for a slow first tap (kept a minute)
 *   GET /v1/catalog/files/<file>       one file, named by its content (kept for good)
 *
 * The files live in the public bucket under `catalog/`. A new snapshot is
 * built by the scheduled run every minute (worker.ts), never behind a request:
 * what a request leaves running is cut off 30 s after its answer, and a build
 * on live takes 13-27 s, longer while the database is busy. Built behind every
 * write, as it was, the builds were cut off 527 times in a day (12 October
 * 2026), each holding the build's claim for 90 s and the database for up to
 * 30 s, so that the scheduled run found the claim held and built nothing.
 * With none built yet the manifest answers 503 and Retry-After until it is.
 * Each run costs one cheap statement when nothing changed.
 */

export interface SnapshotOptions {
  store: SnapshotStore;
  /**
   * The scheduled run builds each new snapshot (worker.ts), so a request only
   * serves the one kept. Unset, it is built on the request's own catalog when
   * main moved on, and the answer waits (local work, tests).
   */
  scheduled?: boolean;
}

/** The manifest moves with the catalog: kept a minute at the edge and in the browser. */
const MANIFEST_CACHE = 'public, max-age=60, s-maxage=60';
/** A file never changes once written: its name carries its sha256. */
const FILE_CACHE = 'public, max-age=31536000, s-maxage=31536000, immutable';

interface Claim {
  token: string;
  until: string;
}

/**
 * The public bucket as a snapshot store. Its claim is one small object
 * written only over the very copy just read (R2's etag condition), so of the
 * isolates that hear of one change at once, one builds it.
 */
export function r2SnapshotStore(bucket: R2Bucket): SnapshotStore {
  const claimMeta = { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' };
  const readClaim = async () => {
    const object = await bucket.get(SNAPSHOT_CLAIM_KEY);
    if (!object) return null;
    let held: Claim | null = null;
    try {
      held = JSON.parse(await object.text()) as Claim;
    } catch {
      // Unreadable: as good as none, and written over.
    }
    return { held, etag: object.etag };
  };
  return {
    async claim(until) {
      const now = await readClaim();
      if (now?.held && Date.parse(now.held.until) > Date.now()) return null;
      const token = crypto.randomUUID();
      const text = JSON.stringify({ token, until: until.toISOString() } satisfies Claim);
      const written = await bucket.put(SNAPSHOT_CLAIM_KEY, text, { httpMetadata: claimMeta, ...(now?.etag ? { onlyIf: { etagMatches: now.etag } } : {}) });
      if (written === null) return null;
      if (!now?.etag) {
        // The first claim ever has no copy to write over: whoever's is there when read back holds it.
        const after = await readClaim();
        if (after?.held?.token !== token) return null;
      }
      return token;
    },
    async release(token) {
      const now = await readClaim();
      if (!now || now.held?.token !== token) return;
      await bucket.put(SNAPSHOT_CLAIM_KEY, JSON.stringify({ token, until: new Date(0).toISOString() } satisfies Claim), { httpMetadata: claimMeta, ...(now.etag ? { onlyIf: { etagMatches: now.etag } } : {}) });
    },
    async get(key) {
      const object = await bucket.get(key);
      return object ? object.text() : null;
    },
    async put(key, text, kind) {
      await bucket.put(key, text, { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: kind === 'immutable' ? FILE_CACHE : 'no-cache' } });
    },
  };
}

export function catalogSnapshotRoutes(app: Hono, catalog: Catalog, options: SnapshotOptions | undefined): void {
  if (!options) return;
  const { store } = options;
  const base = (c: Context) => `${new URL(c.req.url).origin}/v1/catalog/files/`;

  /**
   * The snapshot kept now, as the manifest or the index. With the scheduled run building them it is never built
   * while someone waits: with none yet (an empty bucket) 503 until the run has built one, and behind the catalog the
   * answer serves what there is (the next run, within a minute, has the new snapshot). With no scheduled run (local
   * work, tests) it is built now.
   */
  const latest = async <T extends { version: string }>(c: Context, read: () => Promise<T | null>, answer: (kept: T) => object) => {
    let kept = await read();
    if (!kept && options.scheduled) {
      return c.json({ error: 'busy', message: 'the catalog snapshot is being built; try again shortly' }, 503, { 'Retry-After': '60', 'Cache-Control': 'no-store' });
    }
    if (!options.scheduled) {
      await refreshSnapshot(catalog.db, store);
      kept = await read();
    }
    if (!kept) throw new CatalogError('not-found', 'the catalog snapshot could not be read');
    return c.json(answer(kept), 200, { 'Cache-Control': MANIFEST_CACHE, 'X-Catalog-Version': kept.version });
  };

  app.get('/v1/catalog/manifest.json', (c) => latest(c, () => readManifest(store), (manifest: SnapshotManifest) => ({ ...manifest, base: base(c) }) satisfies SnapshotManifest));
  // Only the files' names, a few hundred bytes: the first thing a slow phone asks for (#265).
  app.get('/v1/catalog/index.json', (c) => latest(c, () => readIndex(store), (index: SnapshotIndex) => index));

  app.get('/v1/catalog/files/:file', async (c) => {
    const file = c.req.param('file');
    if (!SNAPSHOT_FILE_NAME.test(file)) throw new CatalogError('not-found', `${file} is not a file of the catalog snapshot`);
    const text = await store.get(snapshotFileKey(file));
    if (text === null) throw new CatalogError('not-found', `${file} is not a file of the catalog snapshot; the manifest names the files there are`);
    const etag = `"${file.slice(-21, -5)}"`;
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304, { ETag: etag, 'Cache-Control': FILE_CACHE });
    return c.body(text, 200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': FILE_CACHE, ETag: etag });
  });
}
