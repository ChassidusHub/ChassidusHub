import type { Context, Hono, MiddlewareHandler } from 'hono';
import { CatalogError, SNAPSHOT_CLAIM_KEY, SNAPSHOT_FILE_NAME, readManifest, refreshSnapshot, snapshotFileKey, snapshotSeq, type Catalog, type SnapshotManifest, type SnapshotStore } from '@chassidushub/core';
import type { R2Bucket } from './r2.js';

/**
 * The catalog snapshot (core/catalogSnapshot.ts, docs/catalog-snapshot.md):
 * the shelves, sefarim, units and farbrengens as files the new site draws its
 * catalog pages from, in the Worker and in the browser, with no read of the
 * database for each page.
 *
 *   GET /v1/catalog/manifest.json      which files make up the snapshot now (kept a minute)
 *   GET /v1/catalog/files/<file>       one file, named by its content (kept for good)
 *
 * The files live in the public bucket under `catalog/`. A new snapshot is
 * built in the background, never while someone waits (with none built yet the
 * manifest answers 503 and Retry-After until it is): after any change that may have merged
 * something (an Approve, a live fix, an organize), when a manifest is asked
 * for and the catalog has moved on since, and by the scheduled run every
 * minute. Each of those costs one cheap statement when nothing changed.
 */

export interface SnapshotOptions {
  store: SnapshotStore;
  /**
   * Builds a new snapshot if main moved on, on a connection of its own (a
   * request's connection closes when its answer is sent). Unset, it is built
   * on the request's own catalog, and the answer waits (local work, tests).
   */
  rebuild?: () => Promise<unknown>;
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

/**
 * One build at a time in an isolate, and one more after it when asked again
 * meanwhile: a burst of Approves is one build, then one to catch the last.
 */
export function singleFlight(build: () => Promise<unknown>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  const run = async (): Promise<void> => {
    try {
      do {
        again = false;
        await build().catch((error) => console.error('catalog snapshot', error));
      } while (again);
    } finally {
      running = null;
    }
  };
  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = run();
    return running;
  };
}

/**
 * A write that went through may have merged something into main (an Approve,
 * a live fix, an organize, through the site, a token or the MCP server alike):
 * the snapshot catches up behind the answer. Registered before every route.
 */
export function snapshotAfterWrites(options: SnapshotOptions | undefined, waitUntil?: (work: Promise<unknown>) => void): MiddlewareHandler {
  const rebuild = options?.rebuild;
  return async (c, next) => {
    await next();
    if (rebuild && waitUntil && c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS' && c.res.status < 400) waitUntil(rebuild());
  };
}

export function catalogSnapshotRoutes(app: Hono, catalog: Catalog, options: SnapshotOptions | undefined, waitUntil?: (work: Promise<unknown>) => void): void {
  if (!options) return;
  const { store } = options;
  const base = (c: Context) => `${new URL(c.req.url).origin}/v1/catalog/files/`;

  app.get('/v1/catalog/manifest.json', async (c) => {
    let manifest: SnapshotManifest | null = await readManifest(store);
    if (!manifest && options.rebuild && waitUntil) {
      // None yet (an empty bucket): never built while someone waits, since a whole build on live runs past a
      // request's 30 s. It starts behind this answer, and the every-minute run builds it too.
      waitUntil(options.rebuild());
      return c.json({ error: 'busy', message: 'the catalog snapshot is being built; try again shortly' }, 503, { 'Retry-After': '30', 'Cache-Control': 'no-store' });
    }
    if (!manifest) {
      // Local work and tests, with no background: built now.
      manifest = (await refreshSnapshot(catalog.db, store)).manifest;
    } else if (options.rebuild && waitUntil) {
      // Behind the catalog: this answer serves what there is, and the next one has the new snapshot.
      const { seq } = await snapshotSeq(catalog.db);
      if (seq > manifest.seq) waitUntil(options.rebuild());
    } else {
      manifest = (await refreshSnapshot(catalog.db, store)).manifest;
    }
    return c.json({ ...manifest, base: base(c) } satisfies SnapshotManifest, 200, { 'Cache-Control': MANIFEST_CACHE, 'X-Catalog-Version': manifest.version });
  });

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
