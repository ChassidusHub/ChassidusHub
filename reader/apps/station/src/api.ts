import type { CatalogEntry } from '@chassidushub-reader/catalog';

/**
 * The pack API as the station uses it (services/pack-api; `sk-pack serve`
 * locally). `fetchFn` is injected, so tests drive the real handler in
 * process and the Tauri shell can pass its own.
 */

export type FetchFn = (url: string) => Promise<Response>;

export interface ApiMeta {
  catalogVersion: string;
  publishedAt: string;
  years: number[];
  profiles: string[];
}

export interface ApiSize {
  occasions: number;
  objects: number;
  bytes: number;
  missing: number;
  signed: boolean;
  parts: Array<{ index: number; file: string; occasions: number; bytes: number }>;
}

export interface PackApi {
  meta(): Promise<ApiMeta>;
  size(query: string): Promise<ApiSize>;
  /** One part (1-based) of a selection, streamed. */
  build(query: string, part: number): Promise<Response>;
  catalogYear(year: number): Promise<CatalogEntry[]>;
}

export function packApi(base: string, fetchFn: FetchFn = (url) => fetch(url)): PackApi {
  const root = base.replace(/\/+$/, '');
  async function get(path: string): Promise<Response> {
    const response = await fetchFn(`${root}${path}`);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let message = body;
      try {
        message = (JSON.parse(body) as { error?: string }).error ?? body;
      } catch {
        // not JSON
      }
      throw new Error(`${path}: HTTP ${response.status}${message ? ` - ${message}` : ''}`);
    }
    return response;
  }
  const json = async <T>(path: string): Promise<T> => (await (await get(path)).json()) as T;
  return {
    meta: () => json<ApiMeta>('/v1/meta'),
    size: (query) => json<ApiSize>(`/v1/size?${query}`),
    build: (query, part) => get(`/v1/build?${query}&part=${part}`),
    catalogYear: (year) => json<CatalogEntry[]>(`/v1/catalog/${year}`),
  };
}
