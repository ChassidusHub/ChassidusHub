import type { CatalogEntry } from '@sichos-kodesh/catalog';

/** The pack API (services/pack-api; `sk-pack serve` on :8787 locally). */
export const PACK_API = (import.meta.env.VITE_PACK_API as string | undefined)?.replace(/\/+$/, '') ?? 'http://localhost:8787';

export interface Meta {
  catalogVersion: string;
  publishedAt: string;
  years: number[];
  profiles: string[];
  objects: number;
  bytes: number;
}

export interface PrebuiltPack {
  id: string;
  file: string;
  bytes: number;
  profile: string;
  scope: { label: { en: string; he: string }; hebrewYear?: number; month?: string };
  part?: { index: number; count: number };
}

export interface SizeResult {
  scope: { label: { en: string; he: string } };
  occasions: number;
  objects: number;
  bytes: number;
  missing: number;
  signed: boolean;
  parts: Array<{ index: number; file: string; occasions: number; bytes: number }>;
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
  size: (query: string, signal?: AbortSignal) => getJson<SizeResult>(`/v1/size?${query}`, signal),
  buildUrl: (query: string, part: number) => `${PACK_API}/v1/build?${query}&part=${part}`,
  packUrl: (file: string) => `${PACK_API}/v1/packs/${encodeURIComponent(file)}`,
};
