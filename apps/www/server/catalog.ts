import { snapshotFrom, type Snapshot } from '../app/catalog/snapshot';
import type { PageStore } from './pageCache';

/**
 * The catalog snapshot on the server (app/catalog/snapshot.ts,
 * docs/catalog-snapshot.md): read from the public bucket the API writes it
 * to when the Worker binds it, else from the API, and kept in the isolate's
 * memory for as long as it lives, so a catalog page is drawn from memory with
 * no API call. Files never change, so they are also kept at the edge, where
 * a new isolate finds them at once.
 *
 * The browser is handed the same files from this site's own address
 * (`/_/catalog/…`, `catalogFile`), so it needs nothing of another origin.
 */

/** The bucket's reads this uses (an R2 binding). */
export interface SnapshotBucket {
  get(key: string): Promise<{ body: ReadableStream | null; text(): Promise<string> } | null>;
}

/** Where the snapshot's files are read from: the manifest, and a file by its name. */
export interface SnapshotFiles {
  manifest(): Promise<Response>;
  file(name: string): Promise<Response>;
}

/** A file's name, as the manifest names them: nothing that climbs out of the folder. */
const FILE = /^[\w.-]+\.json$/;

const json = (body: BodyInit | null, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

/** The snapshot's files in the bucket the API writes them to (catalog/manifest.json, catalog/files/<file>). */
export function bucketFiles(bucket: SnapshotBucket): SnapshotFiles {
  const read = async (key: string) => {
    const found = await bucket.get(key);
    return found ? json(await found.text()) : json(null, 404);
  };
  return { manifest: () => read('catalog/manifest.json'), file: (name) => (FILE.test(name) ? read(`catalog/files/${name}`) : Promise.resolve(json(null, 404))) };
}

/** The snapshot's files from the API (GET /v1/catalog/manifest.json and /v1/catalog/files/<file>), through `get`. */
export function apiFiles(apiUrl: string, get: (url: string) => Promise<Response>): SnapshotFiles {
  const base = apiUrl.replace(/\/+$/, '');
  return {
    manifest: () => get(`${base}/v1/catalog/manifest.json`),
    file: (name) => (FILE.test(name) ? get(`${base}/v1/catalog/files/${encodeURIComponent(name)}`) : Promise.resolve(json(null, 404))),
  };
}

/** The same files, each file (never the manifest) kept at the edge for good once read. */
export function keptAtEdge(files: SnapshotFiles, edge: PageStore | undefined): SnapshotFiles {
  if (!edge) return files;
  return {
    manifest: () => files.manifest(),
    async file(name) {
      const key = new Request(`https://catalog.snapshot/${encodeURIComponent(name)}`);
      const kept = await edge.match(key).catch(() => undefined);
      if (kept) return kept;
      const answer = await files.file(name);
      if (!answer.ok) return answer;
      const body = await answer.arrayBuffer();
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' };
      await edge.put(key, new Response(body, { headers })).catch(() => undefined);
      return new Response(body, { headers });
    },
  };
}

/**
 * The server's snapshot, at most `waitMs` late: a page in an isolate that has
 * not read the snapshot yet does not wait for it, it is drawn from the API
 * while the snapshot is read behind it for the next page.
 */
export function serverSnapshot(files: SnapshotFiles, waitMs = 250): Snapshot {
  const snapshot = snapshotFrom(files);
  const inTime = <T>(read: Promise<T | null>): Promise<T | null> => Promise.race([read, new Promise<null>((done) => setTimeout(() => done(null), waitMs))]);
  return {
    core: () => inTime(snapshot.core()),
    units: (work) => inTime(snapshot.units(work)),
    year: (year) => inTime(snapshot.year(year)),
    hasYear: (year) => inTime(snapshot.hasYear(year)),
  };
}

/**
 * `/_/catalog/<file>` for the browser: the manifest, asked again every
 * minute, and the files, kept for a year. Also `transcripts.json`, the one
 * read the snapshot leaves to the API (which recordings can be followed,
 * app/catalog/localApi.ts), asked of `transcripts` and kept a minute. Null
 * for any other address.
 */
export async function catalogFile(request: Request, files: SnapshotFiles | null, transcripts?: () => Promise<unknown>): Promise<Response | null> {
  const name = /^\/_\/catalog\/([^/]+)$/.exec(new URL(request.url).pathname)?.[1];
  if (!name || (request.method !== 'GET' && request.method !== 'HEAD')) return null;
  if (name === 'transcripts.json' && files && transcripts) {
    const answer = await transcripts().catch(() => null);
    if (!answer) return new Response('not found', { status: 502 });
    return new Response(JSON.stringify(answer), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=60', 'X-Robots-Tag': 'noindex' } });
  }
  if (!files || !FILE.test(name)) return new Response('not found', { status: 404 });
  const answer = await (name === 'manifest.json' ? files.manifest() : files.file(name)).catch(() => null);
  if (!answer?.ok) return new Response('not found', { status: answer?.status === 404 ? 404 : 502 });
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'X-Robots-Tag': 'noindex' });
  headers.set('Cache-Control', name === 'manifest.json' ? 'public, max-age=60, s-maxage=60' : 'public, max-age=31536000, immutable');
  return new Response(answer.body, { status: 200, headers });
}
