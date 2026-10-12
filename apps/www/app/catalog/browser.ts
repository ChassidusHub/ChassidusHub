import type { ChassidusHub } from '@chassidushub/client';
import { data } from 'react-router';
/** The API, read from the browser (as app/listen/common.ts's API). */
const API = 'https://api.chassidushub.org';
import { localApi } from './localApi';
import { isRebbe } from '../lib/catalog';
import { Core, isNotLocal, snapshotFrom, type Snapshot, type SnapshotSet, type SnapshotWork } from './snapshot';

/**
 * The catalog snapshot in the browser: fetched from this site
 * (`/_/catalog/…`, server/catalog.ts) and kept in Cache Storage, so every
 * catalog click it can answer is drawn here, at once, with no server round
 * trip. It is read in its small cut (snapshot.ts): the index and the top
 * file, a few kB, as soon as a page has loaded, then the file of the top
 * shelf a page is under (`warm`). A later visit needs only the index. Files
 * never change; when the index or the manifest names a newer one of a file,
 * the old one is dropped.
 *
 * Loaded lazily (a route's clientLoader imports it), so it costs a first
 * visit's script nothing.
 */

// public/sw.js keeps this cache by name when a new build takes over.
const CACHE = 'chassidushub-catalog';
const MANIFEST = '/_/catalog/manifest.json';
const INDEX = '/_/catalog/index.json';

/** Cache Storage, where the browser has it (not in a private window of some browsers, nor over plain http). */
const storage = (): CacheStorage | undefined => {
  try {
    return typeof caches === 'undefined' ? undefined : caches;
  } catch {
    return undefined;
  }
};

/**
 * A file from Cache Storage, else from the site, kept for next time. The
 * manifest and the index kept are answered at once while the site is asked
 * for a newer one behind it, which the next check (a minute on) picks up.
 */
async function cached(url: string): Promise<Response> {
  const cache = await storage()?.open(CACHE).catch(() => undefined);
  const kept = await cache?.match(url).catch(() => undefined);
  if (url === MANIFEST || url === INDEX) {
    const asking = fetch(url, { credentials: 'omit' }).then((answer) => {
      // The small cut never reads the whole tree: a tree kept from before it goes.
      if (answer.ok) void keepNamer(url, answer.clone(), url === INDEX ? ['tree'] : []);
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
  if (answer.ok && cache) {
    await cache.put(url, answer.clone()).catch(() => undefined);
    // A shelf's file names its sefarim's files: an older one of each is dropped.
    if (/^\/_\/catalog\/shelf-/.test(url)) void answer.clone().json().then((shelf: { works?: Record<string, { file?: string }> }) => dropOlder(Object.values(shelf.works ?? {}).flatMap((work) => (work.file ? [work.file] : []))), () => undefined);
  }
  return answer;
}

/** The files the manifest or the index names. */
function namedIn(text: string): string[] {
  const named = JSON.parse(text) as {
    tree?: { file: string };
    names?: { file: string } | string;
    works?: Record<string, { file: string }>;
    years?: Record<string, { file: string }> | string;
    top?: string;
    shelves?: Record<string, string>;
  };
  const file = (entry: { file: string } | string | undefined) => (typeof entry === 'string' ? entry : entry?.file);
  return [named.tree, named.names, named.top, ...Object.values(named.works ?? {}), ...(typeof named.years === 'string' ? [named.years] : Object.values(named.years ?? {})), ...Object.values(named.shelves ?? {})]
    .map((entry) => file(entry as { file: string } | string | undefined))
    .filter((name): name is string => !!name);
}

/** Keeps the new manifest or index, and drops the files it names a newer one of, and any of the kinds `gone`. */
async function keepNamer(url: string, answer: Response, gone: string[]): Promise<void> {
  try {
    const text = await answer.text();
    await (await storage()?.open(CACHE))?.put(url, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
    await dropOlder(namedIn(text), gone);
  } catch {
    // One that cannot be read changes nothing kept.
  }
}

/** A file's name without its hash: `shelf-rh-….9c8d….json` is of `shelf-rh-…`. */
const kindOf = (name: string) => name.replace(/\.[0-9a-f]+\.json$/, '');

/** Drops each kept file that one of `current` replaces (the same kind of file under another name), and any of the kinds `gone`. */
async function dropOlder(current: string[], gone: string[] = []): Promise<void> {
  const cache = await storage()?.open(CACHE).catch(() => undefined);
  if (!cache || !current.length) return;
  const now = new Set(current);
  const kinds = new Set([...current.map(kindOf), ...gone]);
  for (const request of await cache.keys()) {
    const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\/_\/catalog\//, ''));
    if (!now.has(name) && kinds.has(kindOf(name)) && name !== 'manifest.json' && name !== 'index.json') await cache.delete(request);
  }
}

let snapshot: Snapshot | null = null;
let api: ChassidusHub | null = null;

/** The browser's snapshot, made once per page load. */
export function browserSnapshot(): Snapshot {
  snapshot ??= snapshotFrom({ manifest: () => cached(MANIFEST), index: () => cached(INDEX), file: (name) => cached(`/_/catalog/${encodeURIComponent(name)}`) });
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
 * Starts reading the snapshot, without waiting, so the next click finds it
 * ready: its core (the index and the top file, a few kB), then the file of
 * the top shelf this page is under (`shelf`, the first level of the page's
 * path bar, else found in the core), so every page under it is drawn here;
 * on a sefer's page, also that sefer's units, so one of its volumes opens at
 * once. Listening's pages read the years file instead, so another year
 * needs only its own file. A page under no shelf (the library, Home,
 * search) reads the Rebbe's shelf, where most people go from it: the other
 * Rebbeim's are read when one is opened, so they never hold up the files a
 * page asks for next. Not on a connection that asks to save data.
 */
export function warm(shelf?: string | null): void {
  if (saveData()) return;
  const snapshot = browserSnapshot();
  const path = decodeURIComponent(location.pathname).replace(/\/+$/, '') || '/';
  void (async () => {
    const core = await snapshot.core();
    if (!core) return;
    if (/^\/listen(\/|$)/.test(path)) {
      await snapshot.hasYear(0);
      return;
    }
    const top = shelf ?? topShelfOf(core, core.byPath.get(path));
    // The last of the Rebbeim in their line is the Rebbe.
    const rebbe = core.tree.top.filter((id) => isRebbe(core.set(id)?.path ?? null)).at(-1);
    const wanted = top ?? rebbe;
    if (wanted) await snapshot.shelf(wanted);
    const now = await snapshot.core();
    const here = now?.byPath.get(path);
    if (here && now!.isWork(here)) warmUnits(here.id);
  })().catch(() => undefined);
}

/** The top shelf an item is under: up from its shelf (a sefer's first shelf) to the one with no parent. */
function topShelfOf(core: Core, item: SnapshotSet | SnapshotWork | undefined): string | null {
  let set = item && (core.isWork(item) ? core.set(item.sets[0] ?? '') : (item as SnapshotSet));
  for (let up = 0; set?.parent && up < 12; up++) set = core.set(set.parent);
  return set?.id ?? null;
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
