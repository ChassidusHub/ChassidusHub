/**
 * The single Cache Storage bucket for every media-proxy response, whether
 * it landed there from ordinary browsing (the service worker's own
 * CacheFirst runtime-caching route - see vite.config.ts) or from a
 * deliberate download (see downloadManager.ts) - both are "this file is
 * available offline," so there's no reason for the download feature to
 * keep its own separate cache the SW wouldn't already read from.
 *
 * Shared between vite.config.ts (a Node/build-time import) and the
 * download code so the name can never drift out of sync between them -
 * this exact cache has already been renamed twice this session to
 * invalidate a poisoned cache (see vite.config.ts's own comment on it),
 * and a name mismatch would silently mean "downloaded" content never
 * actually gets served from cache during real playback.
 */
export const MEDIA_CACHE_NAME = 'media-proxy-cache-v3';
