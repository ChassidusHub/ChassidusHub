import type { CatalogEntry, LibraryCollection, LibraryItemBase } from '@sichos-kodesh/catalog';

/** The published pack API (services/pack-api's Worker). */
const PUBLISHED_PACK_API = 'https://pack-api.sk.chassidushub.org';

/** The pack API: VITE_PACK_API when set; else `sk-pack serve` on :8787 in development and the published Worker in a build. */
export const PACK_API = (import.meta.env.VITE_PACK_API as string | undefined)?.replace(/\/+$/, '') || (import.meta.env.DEV ? 'http://localhost:8787' : PUBLISHED_PACK_API);

/** The phone app's releases: api.sk.chassidushub.org passes the app server's routes through (the pack API Worker keeps the APKs, app-core's appRelease.ts). */
export const APP_API = (import.meta.env.VITE_APP_API as string | undefined)?.replace(/\/+$/, '') || 'https://api.sk.chassidushub.org';

/** The newest release of the phone app, as far as the site needs it. */
export interface AppRelease {
  version: string;
  publishedAt: string;
  files: Array<{ abi: string; file: string; bytes: number; path: string }>;
}

export interface Meta {
  catalogVersion: string;
  publishedAt: string;
  years: number[];
  profiles: string[];
  objects: number;
  bytes: number;
  /** The library collections published (pack-format's library.ts); absent from an older pack API. */
  library?: string[];
  /** How many seforim can join a pack (/v1/works). */
  works?: number;
  /** What a person can take, each file once (a recording whatever its qualities); `bytes` in the original quality. Absent from an older publish. */
  files?: { audio: number; pdf: number; text: number; bytes: number };
}

/** The seforim that can join a pack, bundled by author (pack-format's WorksShelf). */
export interface WorksShelf {
  bundles: Array<{ id: string; label: { he: string; en: string }; works: string[]; bytes: number }>;
  works: ShelfWork[];
  /** The Rebbeim with seforim on the shelf, in the catalog's order; absent from an older pack API. */
  authors?: Array<{ id: string; name: { he: string; en: string } }>;
}

export interface ShelfWork {
  id: string;
  title: { he: string; en: string };
  bundle: string;
  author?: string;
  bytes: number;
  texts: number;
  /** A sefer a pack can take some of: its volumes or parts. */
  parts?: Array<{ id: string; label: { he: string; en: string }; bytes: number; texts: number }>;
}

export interface PrebuiltPack {
  packId: string;
  file: string;
  bytes: number;
  profile: string;
  scope: { kind?: string; collection?: string; label: { en: string; he: string }; hebrewYear?: number; month?: string; work?: string };
  part?: { index: number; count: number };
}

export interface SizeResult {
  scope: { label: { en: string; he: string } };
  occasions: number;
  /** Seforim in the pack (an older pack API leaves it out). */
  works?: number;
  objects: number;
  bytes: number;
  missing: number;
  signed: boolean;
  parts: Array<{ index: number; file: string; occasions: number; works?: number; bytes: number }>;
}

/** The pack API answered and refused: asking again gives the same answer. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${PACK_API}${path}`, { signal });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? `HTTP ${response.status}`, response.status);
  return body;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A size, asked again after a dropped connection (the Worker restarting
 * under load) or a server error: twice, a moment apart. A refusal is final.
 */
async function fetchSize(query: string): Promise<SizeResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getJson<SizeResult>(`/v1/size?${query}`);
    } catch (error) {
      if ((error instanceof ApiError && error.status < 500) || attempt >= 2) throw error;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

interface SizeJob {
  query: string;
  first: boolean;
  callers: number;
  started: boolean;
  promise: Promise<SizeResult>;
  resolve: (value: SizeResult) => void;
  reject: (error: unknown) => void;
}

/**
 * The cart asks for many sizes at once - one per line and the total - and
 * the Worker answers a page's requests side by side in one isolate. So at
 * most two run at a time, the total first; an answer is kept for the visit
 * (the same line with the same settings is not asked again); a size nobody
 * waits for any more is dropped before it starts; and a failure is not
 * kept, so asking again asks the server.
 */
const SIZE_SLOTS = 2;
const sizeAnswers = new Map<string, SizeResult>();
const sizeJobs = new Map<string, SizeJob>();
const sizeQueue: SizeJob[] = [];
let sizesRunning = 0;

function runSizes(): void {
  while (sizesRunning < SIZE_SLOTS && sizeQueue.length > 0) {
    const first = sizeQueue.findIndex((job) => job.first);
    const [job] = sizeQueue.splice(Math.max(first, 0), 1);
    job!.started = true;
    sizesRunning++;
    fetchSize(job!.query)
      .then((value) => {
        if (sizeAnswers.size >= 500) sizeAnswers.delete(sizeAnswers.keys().next().value!);
        sizeAnswers.set(job!.query, value);
        job!.resolve(value);
      }, job!.reject)
      .finally(() => {
        sizeJobs.delete(job!.query);
        sizesRunning--;
        runSizes();
      });
  }
}

function size(query: string, signal?: AbortSignal, first = false): Promise<SizeResult> {
  const known = sizeAnswers.get(query);
  if (known) return Promise.resolve(known);
  let job = sizeJobs.get(query);
  if (!job) {
    let resolve!: (value: SizeResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<SizeResult>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    job = { query, first, callers: 0, started: false, promise, resolve, reject };
    sizeJobs.set(query, job);
    sizeQueue.push(job);
  }
  const current = job;
  current.first ||= first;
  current.callers++;
  runSizes();
  return new Promise<SizeResult>((resolve, reject) => {
    const abandon = () => {
      current.callers--;
      if (!current.started && current.callers === 0) {
        sizeQueue.splice(sizeQueue.indexOf(current), 1);
        sizeJobs.delete(current.query);
      }
      reject(new DOMException('The size is no longer needed', 'AbortError'));
    };
    if (signal?.aborted) return abandon();
    signal?.addEventListener('abort', abandon, { once: true });
    current.promise.then(resolve, reject).finally(() => signal?.removeEventListener('abort', abandon));
  });
}

/** A refusal because the archive does not hold it (yet), not a failure to ask. */
export function isNotArchived(error: string): boolean {
  return /holds nothing|not in the published archive|no seforim/.test(error);
}

export const api = {
  meta: (signal?: AbortSignal) => getJson<Meta>('/v1/meta', signal),
  packs: async (signal?: AbortSignal) => (await getJson<{ packs: PrebuiltPack[] }>('/v1/packs/index.json', signal).catch(() => ({ packs: [] }))).packs,
  catalogYear: (year: number, signal?: AbortSignal) => getJson<CatalogEntry[]>(`/v1/catalog/${year}`, signal),
  works: (signal?: AbortSignal) => getJson<WorksShelf>('/v1/works', signal),
  library: (collection: string, signal?: AbortSignal) => getJson<LibraryCollection<LibraryItemBase>>(`/v1/library/${collection}`, signal),
  /** A cart's size; `first` puts it ahead of the others waiting (the cart's total). */
  size,
  buildUrl: (query: string, part: number) => `${PACK_API}/v1/build?${query}&part=${part}`,
  packUrl: (file: string) => `${PACK_API}/v1/packs/${encodeURIComponent(file)}`,
  appRelease: async (signal?: AbortSignal) => {
    const response = await fetch(`${APP_API}/v1/app/android/latest.json`, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as AppRelease;
  },
  appDownloadUrl: (abi: string) => `${APP_API}/v1/app/android/download/${abi}`,
};
