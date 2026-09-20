/** services/media-proxy's deployed Worker URL. */
export const MEDIA_PROXY_BASE_URL = 'https://sichos-kodesh-media-proxy.shmuky.workers.dev';

/**
 * The web PWA's production origin - used to build shareable links and the
 * privacy-policy URL from this native app. Currently the Vercel-assigned
 * domain; update this in one place once the planned sk.shmuky.dev custom
 * domain goes live.
 */
export const WEB_APP_BASE_URL = 'https://sichoskodesh.vercel.app';

/** Diaspora scheduling only; Israel (`IL = true`) is not supported yet. */
export const IL = false;
