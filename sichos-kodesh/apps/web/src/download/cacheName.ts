/**
 * The single Cache Storage bucket for every media-proxy response, whether
 * it landed there from ordinary browsing (the service worker's own
 * CacheFirst runtime-caching route - see vite.config.ts) or from a
 * deliberate download (see downloadManager.ts) - both are "this file is
 * available offline," so there's no reason for the download feature to
 * keep its own separate cache the SW wouldn't already read from.
 *
 * Shared between vite.config.ts (a Node/build-time import) and the
 * download code so the name can never drift out of sync between them - a
 * mismatch would silently mean "downloaded" content never actually gets
 * served from cache during real playback. The version suffix exists so
 * the cache can be renamed to force every client to abandon a poisoned
 * cache (see vite.config.ts's matching runtimeCaching comment).
 */
export const MEDIA_CACHE_NAME = 'media-proxy-cache-v3';

/**
 * pdf.js's own runtime dependencies fetched by hardcoded URL rather than
 * imported as JS - the worker script itself (`pdf.worker.min-*.mjs`) and
 * its `pdf-wasm/`/`pdf-cmaps/`/`pdf-standard-fonts/` asset directories (see
 * vite.config.ts's `copyPdfAssets`) - are already in the PWA's precache
 * manifest, but precaching is all-or-nothing at service-worker *install*
 * time: if a single one of the ~200 precached files fails to fetch (a real
 * risk for the worker script specifically, at 1.2+MB, on a flaky mobile
 * connection), the *entire* new service worker fails to install and every
 * one of its fixes - this cache included - never takes effect for that
 * visitor, who keeps silently running the old version. This separate,
 * explicitly-populated cache (see vite.config.ts's matching runtimeCaching
 * rule, and main.tsx's eager warm-up of the worker script specifically) is
 * a second, independent path to the exact same files - populated by any
 * ordinary successful fetch of them, not contingent on the whole precache
 * manifest installing atomically.
 */
export const PDF_RUNTIME_CACHE_NAME = 'pdf-runtime-cache-v1';
