
/**
 * The catalog snapshot's files (docs/catalog-snapshot.md), handed to the
 * browser from this site's own address (`/_/catalog/…`, `catalogFile`), so it
 * needs nothing of another origin: read from the public bucket the API writes
 * them to when the Worker binds it, else from the API. Files never change, so
 * they are kept at the edge once read.
 *
 * The server draws its pages from the API, so the edge can tag each with
 * what it shows and forget it when that changes (server/edge.ts); the one
 * exception is the Listen year page (#321, app/catalog/onServer.ts), kept at
 * the edge ten minutes only. The browser draws its clicks from the snapshot
 * (app/catalog).
 */

/** The Workers cache's reads and writes this uses (`caches.default`). */
export interface EdgeStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** The bucket's reads this uses (an R2 binding). */
export interface SnapshotBucket {
  get(key: string): Promise<{ body: ReadableStream | null; text(): Promise<string> } | null>;
}

/** Where the snapshot's files are read from: the manifest, the index (the files' names only, #265), and a file by its name. */
export interface SnapshotFiles {
  manifest(): Promise<Response>;
  index?(): Promise<Response>;
  file(name: string): Promise<Response>;
}

/**
 * The snapshot's index (#265), kept in this isolate's memory for every
 * page's HTML (app/root.tsx), so the browser asks for the top file and the
 * page's shelf as soon as the page loads, without first asking for the
 * index. Asked again at most every minute, behind the page (`later`, the
 * Worker's waitUntil): a page never waits for it, and goes out without it
 * until it has come. A page kept at the edge keeps the index it was drawn
 * with; the files it names stay readable (docs/catalog-snapshot.md).
 * Answers it as the page writes it: only an index of the small cut's
 * format, with `<` escaped so it cannot end its script.
 */
export function indexKeeper(files: SnapshotFiles | null, { every = 60_000, now = Date.now } = {}) {
  let text: string | null = null;
  let asked = -Infinity;
  let asking: Promise<void> | null = null;
  return (later: (work: Promise<unknown>) => void = () => undefined): string | null => {
    if (files?.index && !asking && now() - asked >= every) {
      asked = now();
      asking = files
        .index()
        .then(async (answer) => {
          if (!answer.ok) return;
          const index = JSON.parse(await answer.text()) as { format?: unknown };
          const written = JSON.stringify(index);
          if (index?.format === 2 && written.length < 8_000) text = written.replace(/</g, '\\u003c');
        })
        .catch(() => undefined)
        .finally(() => (asking = null));
      later(asking);
    }
    return text;
  };
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
  return { manifest: () => read('catalog/manifest.json'), index: () => read('catalog/index.json'), file: (name) => (FILE.test(name) ? read(`catalog/files/${name}`) : Promise.resolve(json(null, 404))) };
}

/** The snapshot's files from the API (GET /v1/catalog/manifest.json and /v1/catalog/files/<file>), through `get`. */
export function apiFiles(apiUrl: string, get: (url: string) => Promise<Response>): SnapshotFiles {
  const base = apiUrl.replace(/\/+$/, '');
  return {
    manifest: () => get(`${base}/v1/catalog/manifest.json`),
    index: () => get(`${base}/v1/catalog/index.json`),
    file: (name) => (FILE.test(name) ? get(`${base}/v1/catalog/files/${encodeURIComponent(name)}`) : Promise.resolve(json(null, 404))),
  };
}

/** The same files, each file (never the manifest) kept at the edge for good once read. */
export function keptAtEdge(files: SnapshotFiles, edge: EdgeStore | undefined): SnapshotFiles {
  if (!edge) return files;
  return {
    manifest: () => files.manifest(),
    ...(files.index ? { index: () => files.index!() } : {}),
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
 * `/_/catalog/<file>` for the browser: the manifest and the index, asked
 * again every minute, and the files, kept for a year. Also `transcripts.json`, the one
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
  const moving = name === 'manifest.json' || name === 'index.json';
  const read = name === 'manifest.json' ? files.manifest() : name === 'index.json' ? (files.index?.() ?? Promise.resolve(json(null, 404))) : files.file(name);
  const answer = await read.catch(() => null);
  if (!answer?.ok) return new Response('not found', { status: answer?.status === 404 ? 404 : 502 });
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'X-Robots-Tag': 'noindex' });
  headers.set('Cache-Control', moving ? 'public, max-age=60, s-maxage=60' : 'public, max-age=31536000, immutable');
  return new Response(answer.body, { status: 200, headers });
}
