import type { ChassidusHub } from '@chassidushub/client';
import { data } from 'react-router';
/** The API, read from the browser (as app/listen/common.ts's API). */
const API = 'https://api.chassidushub.org';
import { localApi } from './localApi';
import { isNotLocal, snapshotFrom, type Snapshot } from './snapshot';

/**
 * The catalog snapshot in the browser: fetched once from this site
 * (`/_/catalog/…`, server/catalog.ts) and kept in Cache Storage, so after
 * the first page every catalog click is drawn here, at once, with no server
 * round trip, and a later visit needs only the small manifest. Parts never
 * change; when the manifest names new ones, the old are dropped.
 *
 * Loaded lazily (a route's clientLoader imports it), so it costs a first
 * visit's script nothing.
 */

// public/sw.js keeps this cache by name when a new build takes over.
const CACHE = 'chassidushub-catalog';
const MANIFEST = '/_/catalog/manifest.json';

/** Cache Storage, where the browser has it (not in a private window of some browsers, nor over plain http). */
const storage = (): CacheStorage | undefined => {
  try {
    return typeof caches === 'undefined' ? undefined : caches;
  } catch {
    return undefined;
  }
};

/**
 * A part from Cache Storage, else from the site, kept for next time. The
 * manifest kept is answered at once while the site is asked for a newer one
 * behind it, which the next check (a minute on) picks up.
 */
async function cached(url: string): Promise<Response> {
  const cache = await storage()?.open(CACHE).catch(() => undefined);
  const kept = await cache?.match(url).catch(() => undefined);
  if (url === MANIFEST) {
    const asking = fetch(url, { credentials: 'omit' }).then((answer) => {
      if (answer.ok) void tidy(answer.clone());
      return answer;
    });
    if (kept) {
      asking.catch(() => undefined);
      return kept;
    }
    return asking;
  }
  if (kept) return kept;
  const answer = await fetch(url, { credentials: 'omit' });
  if (answer.ok && cache) await cache.put(url, answer.clone()).catch(() => undefined);
  return answer;
}

/** Keeps the new manifest, and drops the parts it no longer names. */
async function tidy(manifest: Response): Promise<void> {
  const cache = await storage()?.open(CACHE).catch(() => undefined);
  if (!cache) return;
  try {
    const text = await manifest.text();
    const named = JSON.parse(text) as { tree?: { file: string }; names?: { file: string }; works?: Record<string, { file: string }>; years?: Record<string, { file: string }> };
    const files = [named.tree, named.names, ...Object.values(named.works ?? {}), ...Object.values(named.years ?? {})].flatMap((entry) => (entry?.file ? [entry.file] : []));
    const keep = new Set([MANIFEST, ...files.map((name) => `/_/catalog/${encodeURIComponent(name)}`)]);
    await cache.put(MANIFEST, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
    for (const request of await cache.keys()) if (!keep.has(new URL(request.url).pathname)) await cache.delete(request);
  } catch {
    // A manifest that cannot be read changes nothing kept.
  }
}

let snapshot: Snapshot | null = null;
let api: ChassidusHub | null = null;

/** The browser's snapshot, made once per page load. */
export function browserSnapshot(): Snapshot {
  snapshot ??= snapshotFrom({ manifest: () => cached(MANIFEST), file: (name) => cached(`/_/catalog/${encodeURIComponent(name)}`) });
  return snapshot;
}

/**
 * The one read the snapshot leaves to the API: which recordings can be
 * followed (app/catalog/localApi.ts), from this site (server/catalog.ts),
 * kept a few minutes.
 */
const remote = {
  baseUrl: API,
  transcribedRecordings: async () => {
    const answer = await fetch('/_/catalog/transcripts.json', { credentials: 'omit' });
    if (!answer.ok) throw Object.assign(new Error('transcripts'), { status: answer.status });
    return answer.json();
  },
} as unknown as ChassidusHub;

/** The API's catalog reads, answered by the browser's snapshot (app/catalog/localApi.ts). */
export function browserApi(): ChassidusHub {
  api ??= localApi(browserSnapshot(), remote);
  return api;
}

/**
 * Starts reading the snapshot's core, without waiting: the page that is open
 * calls this when the browser is idle, so the next click finds it ready; on a
 * sefer's page, also that sefer's units, so one of its volumes opens at once.
 * Not on a connection that asks to save data.
 */
export function warm(): void {
  if (saveData()) return;
  const snapshot = browserSnapshot();
  void snapshot
    .core()
    .then((core) => {
      const here = core?.byPath.get(decodeURIComponent(location.pathname).replace(/\/+$/, ''));
      if (here && core!.isWork(here)) warmUnits(here.id);
    })
    .catch(() => undefined);
}

const saveData = () => !!(navigator as { connection?: { saveData?: boolean } }).connection?.saveData;

/**
 * The browser's catalog reads when its snapshot's core is at hand (kept from
 * an earlier page, or read from Cache Storage in a moment), else null: the
 * click then goes to the server as before, and the snapshot is read behind it
 * for the next one. A click never waits on the snapshot's download.
 */
export async function readyApi(waitMs = 60): Promise<ChassidusHub | null> {
  const core = browserSnapshot().core();
  const ready = await Promise.race([core, new Promise<null>((done) => setTimeout(() => done(null), waitMs))]).catch(() => null);
  return ready ? browserApi() : null;
}


/** Starts reading one sefer's units, without waiting, so opening one of its volumes is drawn at once. */
export function warmUnits(work: string): void {
  if (!saveData()) void browserSnapshot().units(work);
}

/**
 * A route's clientLoader: the page drawn by `draw` from the snapshot, or
 * asked of the server (`serverLoader`) when the snapshot is not at hand or
 * cannot answer. A redirect or a 404 drawn from the snapshot stands.
 */
export async function drawn<T>(serverLoader: () => Promise<T>, draw: (api: ChassidusHub) => Promise<unknown>): Promise<T> {
  const local = await readyApi();
  if (local) {
    try {
      return (await draw(local)) as T;
    } catch (error) {
      if (isNotLocal(error)) return serverLoader();
      const status = (error as { status?: number } | null)?.status;
      throw status === 404 || status === 400 ? data('not found', { status: 404 }) : error;
    }
  }
  return serverLoader();
}
