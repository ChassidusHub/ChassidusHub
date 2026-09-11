/**
 * services/media-proxy's deployed Worker URL - live as of this pass,
 * verified with a real ranged request against a known audio file
 * (206 Partial Content, correct Content-Range, no leaked origin headers).
 */
export const MEDIA_PROXY_BASE_URL = 'https://sichos-kodesh-media-proxy.shmuky.workers.dev';

/** Diaspora-only for this pass - see docs/PLANNING.md open question #9. */
export const IL = false;
