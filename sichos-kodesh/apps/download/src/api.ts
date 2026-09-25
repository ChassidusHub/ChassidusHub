import type { CatalogEntry, LibraryCollection, LibraryItemBase } from '@sichos-kodesh/catalog';

/** The published pack API (services/pack-api's Worker). */
const PUBLISHED_PACK_API = 'https://sichos-kodesh-pack-api.shmuky.workers.dev';

/** The pack API: VITE_PACK_API when set; else `sk-pack serve` on :8787 in development and the published Worker in a build. */
export const PACK_API = (import.meta.env.VITE_PACK_API as string | undefined)?.replace(/\/+$/, '') || (import.meta.env.DEV ? 'http://localhost:8787' : PUBLISHED_PACK_API);

/** The phone app's releases: api.sk.shmuky.dev passes the app server's routes through (the pack API Worker keeps the APKs, app-core's appRelease.ts). */
export const APP_API = (import.meta.env.VITE_APP_API as string | undefined)?.replace(/\/+$/, '') || 'https://api.sk.shmuky.dev';

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
}

/** The seforim that can join a pack, bundled by author (pack-format's WorksShelf). */
export interface WorksShelf {
  bundles: Array<{ id: string; label: { he: string; en: string }; works: string[]; bytes: number }>;
  works: Array<{ id: string; title: { he: string; en: string }; bundle: string; bytes: number; texts: number }>;
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

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${PACK_API}${path}`, { signal });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

export const api = {
  meta: (signal?: AbortSignal) => getJson<Meta>('/v1/meta', signal),
  packs: async (signal?: AbortSignal) => (await getJson<{ packs: PrebuiltPack[] }>('/v1/packs/index.json', signal).catch(() => ({ packs: [] }))).packs,
  catalogYear: (year: number, signal?: AbortSignal) => getJson<CatalogEntry[]>(`/v1/catalog/${year}`, signal),
  works: (signal?: AbortSignal) => getJson<WorksShelf>('/v1/works', signal),
  library: (collection: string, signal?: AbortSignal) => getJson<LibraryCollection<LibraryItemBase>>(`/v1/library/${collection}`, signal),
  size: (query: string, signal?: AbortSignal) => getJson<SizeResult>(`/v1/size?${query}`, signal),
  buildUrl: (query: string, part: number) => `${PACK_API}/v1/build?${query}&part=${part}`,
  packUrl: (file: string) => `${PACK_API}/v1/packs/${encodeURIComponent(file)}`,
  appRelease: async (signal?: AbortSignal) => {
    const response = await fetch(`${APP_API}/v1/app/android/latest.json`, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as AppRelease;
  },
  appDownloadUrl: (abi: string) => `${APP_API}/v1/app/android/download/${abi}`,
};
