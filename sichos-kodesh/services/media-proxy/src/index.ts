/**
 * Media proxy (Cloudflare Worker): the app never shows a user a
 * drive.google.com URL, a Drive viewer, or any other source-site UI.
 * Every download goes through this Worker's own domain; the Worker
 * fetches from the real source server-side and streams bytes back under
 * our own API, so from the client's perspective a farbrengen's hanacha
 * PDF "just downloads," the way a track downloads from Spotify.
 *
 * Phase 1 (this file): stateless proxy only, no storage - every request
 * still round-trips to Google Drive. Phase 2 (see docs/PLANNING.md): add
 * an R2-backed cache in front of this same route shape, so a file is
 * fetched from Drive once and served from our own CDN after that. The
 * route shape (`/drive/:fileId`) is designed to survive that upgrade
 * unchanged - the client-facing API doesn't need to change when the
 * backing storage does.
 *
 * Scope note: this only proxies Google Drive-hosted links (the hanacha/
 * maamar PDFs) - per docs/PLANNING.md, audio (ashreinu.app) and video
 * (YouTube/JEM/etc.) are deliberately NOT wired up here yet. Audio in
 * particular depends on JEM's own private, undocumented API - proxying
 * that without their knowledge is a different thing than proxying a
 * publicly-shared Drive file, and is meant to go through the planned JEM
 * outreach first, not get built quietly.
 */

export const DRIVE_ID_PATTERN = /^[a-zA-Z0-9_-]{10,64}$/;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days - Phase 1's only caching until R2 lands

export interface Env {
  // Reserved for Phase 2 (R2 bucket binding). Intentionally empty in Phase 1.
}

export function driveDownloadUrl(fileId: string, confirmToken?: string): string {
  const url = new URL('https://drive.google.com/uc');
  url.searchParams.set('export', 'download');
  url.searchParams.set('id', fileId);
  if (confirmToken) url.searchParams.set('confirm', confirmToken);
  return url.toString();
}

/**
 * Google Drive serves large files behind a "can't scan for viruses"
 * interstitial instead of the file directly. The well-documented
 * workaround: the interstitial is HTML containing a `confirm=<token>`
 * value: re-requesting the same download URL with that token (and the
 * cookies the interstitial set) returns the real file. Small files skip
 * this entirely and are returned directly on the first request.
 */
export function extractConfirmToken(html: string): string | null {
  const match = html.match(/confirm=([0-9A-Za-z_-]+)/);
  return match ? match[1]! : null;
}

export async function fetchFromDrive(fileId: string): Promise<Response> {
  const first = await fetch(driveDownloadUrl(fileId), { redirect: 'follow' });
  const contentType = first.headers.get('content-type') ?? '';

  if (!contentType.includes('text/html')) {
    return first; // small file - Drive returned it directly
  }

  const html = await first.text();
  const token = extractConfirmToken(html);
  if (!token) {
    // Not the interstitial we expected - surface the HTML for debugging rather than silently mis-serving it as a "file."
    return new Response('Drive returned an unexpected HTML response instead of a file or a confirm-token interstitial.', {
      status: 502,
    });
  }

  const cookie = first.headers.get('set-cookie') ?? undefined;
  return fetch(driveDownloadUrl(fileId, token), {
    redirect: 'follow',
    headers: cookie ? { cookie } : undefined,
  });
}

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/drive\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      return new Response('Not found', { status: 404 });
    }

    const fileId = match[1]!;
    if (!DRIVE_ID_PATTERN.test(fileId)) {
      return new Response('Invalid file id', { status: 400 });
    }

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const upstream = await fetchFromDrive(fileId);
    if (!upstream.ok) {
      return new Response(`Upstream fetch failed with status ${upstream.status}`, { status: 502 });
    }

    // Built fresh rather than cloning upstream.headers: Drive's response carries
    // infrastructure headers (Server: UploadServer, x-guploader-uploadid,
    // x-goog-hash, a long Google-specific access-control-allow-headers list,
    // ...) that would leak the real origin to anyone inspecting network
    // traffic, even though the URL bar already shows only our own domain.
    const filename = url.searchParams.get('filename');
    const headers = new Headers({
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    });
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    if (filename) {
      headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    }

    const response = new Response(upstream.body, { status: 200, headers });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
