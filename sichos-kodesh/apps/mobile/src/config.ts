/**
 * services/media-proxy's deployed Worker URL. There is no live deployment
 * yet (see that service's wrangler.toml - no account_id is set) - this
 * placeholder must be replaced with the real URL after `wrangler deploy`,
 * or pointed at a `wrangler dev` LAN address for local testing.
 */
export const MEDIA_PROXY_BASE_URL = 'https://REPLACE-ME.workers.dev';

/** Diaspora-only for this pass - see docs/PLANNING.md open question #9. */
export const IL = false;
