import { createRequestHandler, type ServerBuild } from 'react-router';
import { apiFor, forwardFor, visitorApi } from '../app/lib/api';
import { pageContext } from '../app/serverOnly';
import type { ChassidusHub } from '@chassidushub/client';
import { localApi } from '../app/catalog/localApi';
import { apiFiles, bucketFiles, catalogFile, keptAtEdge, serverSnapshot, type SnapshotBucket, type SnapshotFiles } from './catalog';
import { cachedPage, type PageStore } from './pageCache';
import { bucketShowcases, type ShowcaseBucket } from '../app/stewards/showcase';
// @ts-ignore - made by `react-router build`
import * as build from '../build/server/index.js';

interface Env {
  /** The API Worker, reached inside Cloudflare (wrangler.toml). */
  API?: { fetch(input: string, init?: RequestInit): Promise<Response> };
  /** The API's public address, used only when the binding is absent. */
  API_URL?: string;
  /** The public bucket, where showcases are kept (app/stewards/showcase.ts). */
  FILES_PUBLIC?: ShowcaseBucket;
  /** "off" draws every page from the API, not from the catalog snapshot (server/catalog.ts). */
  CATALOG_SNAPSHOT?: string;
}

/**
 * The new site on Cloudflare Workers. Built files (build/client) are answered
 * by the Workers assets binding before this runs (wrangler.toml); everything
 * else is a page, rendered here.
 */
const handler = createRequestHandler(build as unknown as ServerBuild);

/** The Workers cache, when there is one (not in tests or on Node). */
const edge = (): PageStore | undefined => (globalThis as { caches?: { default?: PageStore } }).caches?.default;

/** The catalog snapshot, read once per isolate and kept for its life (server/catalog.ts). */
let catalog: { files: SnapshotFiles; api: ChassidusHub } | null = null;

function catalogFor(env: Env, api: ChassidusHub) {
  if (env.CATALOG_SNAPSHOT === 'off') return null;
  if (!catalog) {
    // Straight from the bucket the API writes it to, else through the API.
    const files = env.FILES_PUBLIC
      ? bucketFiles(env.FILES_PUBLIC as unknown as SnapshotBucket)
      : apiFiles(env.API_URL ?? 'https://api.chassidushub.org', (url) => (env.API ? env.API.fetch(url) : fetch(url)));
    const kept = keptAtEdge(files, edge());
    catalog = { files: kept, api: localApi(serverSnapshot(kept), api) };
  }
  return catalog;
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(work: Promise<unknown>): void }): Promise<Response> {
    const api = apiFor({ binding: env.API, baseUrl: env.API_URL });
    const snapshot = catalogFor(env, api);
    // The snapshot's files, for the browser to keep.
    const file = await catalogFile(request, snapshot?.files ?? null, () => snapshot!.api.transcribedRecordings({ limit: 1000 }));
    if (file) return file;
    const draw = (asked: Request) =>
      handler(asked, {
        api,
        visitor: visitorApi(asked, (cookie) => apiFor({ binding: env.API, baseUrl: env.API_URL, cookie })),
        forward: forwardFor({ binding: env.API, baseUrl: env.API_URL }),
        showcases: env.FILES_PUBLIC ? bucketShowcases(env.FILES_PUBLIC) : undefined,
        catalog: snapshot?.api,
        ...pageContext(asked),
      });
    // A page anyone may have is kept at the edge (server/pageCache.ts).
    const store = edge();
    return store ? cachedPage(request, store, draw, (work) => ctx.waitUntil(work)) : draw(request);
  },
};
