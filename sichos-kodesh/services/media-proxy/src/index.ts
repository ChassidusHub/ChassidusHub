/**
 * Media proxy (Cloudflare Worker): the app never shows a user a
 * drive.google.com or cloudfront.net URL, a Drive viewer, or any other
 * source-site UI. Every download goes through this Worker's own domain;
 * the Worker fetches from the real source server-side and streams bytes
 * back under our own API, so from the client's perspective a farbrengen's
 * hanacha PDF or audio "just downloads," the way a track downloads from
 * Spotify.
 *
 * Phase 1 (this file): stateless proxy only, no storage of our own -
 * every request still round-trips to the real source. Phase 2 (see
 * docs/PLANNING.md): add an R2-backed cache in front of these same route
 * shapes, so a file is fetched once and served from our own CDN after
 * that. The route shapes are designed to survive that upgrade unchanged -
 * the client-facing API doesn't need to change when the backing storage
 * does.
 *
 * Two sources, two routes:
 * - `/drive/:fileId` - Google Drive-hosted hanacha/maamar PDFs. Needs
 *   Drive's confirm-token dance handled server-side for files over ~100MB.
 * - `/jem-audio/:filename` - JEM's own CloudFront-hosted audio files
 *   (resolved via packages/mafteiach-index's jemAudio.ts from JEM's
 *   private "ccdb" API - see that package's README/db for how a
 *   farbrengen occasion maps to a filename here). No confirm-token dance
 *   needed; CloudFront serves these directly. This is being used now for
 *   private, pre-launch development per docs/PLANNING.md - a real
 *   conversation with JEM about this is still the plan before anyone but
 *   us hits this route.
 *
 * Video is NOT proxied here. YouTube-sourced video has its own platform
 * Terms-of-Service problem independent of the underlying content's
 * rights - not something a proxy fixes.
 */

export const DRIVE_ID_PATTERN = /^[a-zA-Z0-9_-]{10,64}$/;
export const DRIVE_RESOURCE_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
export const JEM_AUDIO_FILENAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}\.(mp3|m4a|opus)$/;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days - Phase 1's only caching until R2 lands
const JEM_AUDIO_CDN_BASE = 'https://dtgj2yu3gmlic.cloudfront.net';

/**
 * apps/mobile (React Native fetch) never needed this - no same-origin
 * policy there. apps/web does: a plain `<audio src>`/`<a href>` doesn't
 * enforce CORS, but a service worker caching those requests in `cors`
 * mode (needed so Workbox's range-request handling can read Content-Length
 * to slice cached responses for seeking - impossible on an opaque no-cors
 * response) does. `Access-Control-Allow-Origin: *` is safe here: every
 * route serves public, unauthenticated, read-only content with no cookies
 * or credentials involved.
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
};

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export interface Env {
  // Reserved for Phase 2 (R2 bucket binding). Intentionally empty in Phase 1.
}

export function driveDownloadUrl(fileId: string, confirmToken?: string, resourceKey?: string | null): string {
  const url = new URL('https://drive.google.com/uc');
  url.searchParams.set('export', 'download');
  url.searchParams.set('id', fileId);
  if (confirmToken) url.searchParams.set('confirm', confirmToken);
  if (resourceKey) url.searchParams.set('resourcekey', resourceKey);
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

/**
 * `resourceKey`: Google added "resource keys" as an extra access
 * requirement for links shared before a 2021 security change - a file
 * that needs one 404s/redirects to a sign-in page without it, even
 * though it's genuinely public. Confirmed directly: 253 of this app's
 * real crawled Drive links carry a `resourcekey=` param in their
 * original share URL, and a sample of those otherwise fail with the
 * plain `id=` request and succeed once `resourcekey` is forwarded too -
 * this isn't a rare edge case, it's roughly 4% of all Drive PDF links
 * genuinely requiring it to be reachable at all.
 */
export async function fetchFromDrive(fileId: string, resourceKey?: string | null): Promise<Response> {
  const first = await fetch(driveDownloadUrl(fileId, undefined, resourceKey), { redirect: 'follow' });
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
  return fetch(driveDownloadUrl(fileId, token, resourceKey), {
    redirect: 'follow',
    headers: cookie ? { cookie } : undefined,
  });
}

const AUDIO_FILE_EXTENSIONS = ['mp3', 'm4a', 'opus'] as const;

/**
 * JEM's CloudFront distribution serves audio directly - no interstitial,
 * no auth. Confirmed live. `range` is forwarded as-is so a player can seek
 * within a track.
 *
 * The extension in `filename` comes from packages/mafteiach-index's crawl
 * of JEM's own ccdb API, which isn't always reliable about which of
 * mp3/m4a/opus a recording actually is - confirmed directly against
 * CloudFront: every "AR"-prefixed recording in the crawled dataset (586 of
 * 1,268 total, not a rare edge case) is recorded as .mp3 but 404s there,
 * while the exact same base filename exists as .m4a and .opus. Rather than
 * trust the stored extension, try the other real ones on a 404/error
 * before giving up - at most 2 extra upstream requests, and only when the
 * first one fails, so the common case (already-correct extension) pays no
 * added latency.
 */
export async function fetchFromJemAudioCdn(filename: string, range?: string | null): Promise<Response> {
  const opts = range ? { headers: { Range: range } } : undefined;
  const first = await fetch(`${JEM_AUDIO_CDN_BASE}/${filename}`, opts);
  if (first.ok || first.status === 206) return first;

  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex === -1 ? filename : filename.slice(0, dotIndex);
  const triedExt = dotIndex === -1 ? '' : filename.slice(dotIndex + 1);
  for (const ext of AUDIO_FILE_EXTENSIONS) {
    if (ext === triedExt) continue;
    const alt = await fetch(`${JEM_AUDIO_CDN_BASE}/${base}.${ext}`, opts);
    if (alt.ok || alt.status === 206) return alt;
  }
  return first; // none of the alternates worked either - return the original failure
}

/**
 * Builds the response headers fresh rather than cloning upstream.headers
 * - both Drive and CloudFront responses carry infrastructure headers
 * (Server: UploadServer / AmazonS3, x-guploader-uploadid, x-goog-hash,
 * x-amz-cf-id, a long Google-specific access-control-allow-headers list,
 * ...) that would leak the real origin to anyone inspecting network
 * traffic, even though the URL bar already shows only our own domain.
 *
 * `Accept-Ranges` / `Content-Range` are carried through deliberately - an
 * audio player needs to seek within a track, which means issuing Range
 * requests and getting back real 206 responses, not always the full file
 * (an easy thing to silently get wrong: a proxy that ignores the client's
 * Range header and always returns 200-with-everything still "works" in
 * that audio plays, but seeking breaks or re-downloads the whole file).
 *
 * `contentType`, when passed, overrides whatever upstream sent - needed
 * because Drive's `uc?export=download` endpoint returns a generic
 * `application/octet-stream` for every file regardless of its real type
 * (confirmed with a real PDF), so trusting it would stop a browser from
 * ever rendering a PDF inline.
 *
 * `Content-Disposition: inline` (not `attachment`), when a filename is
 * given: apps/web opens this same URL directly (`window.open`/`<a
 * target="_blank">`) so a browser shows the PDF, not a forced download -
 * `attachment` overrides that regardless of Content-Type and silently
 * routes the file to the Downloads folder instead, which looks exactly
 * like "nothing happened." `inline` still carries the filename as a
 * save-as hint. This has no effect on apps/mobile, which downloads bytes
 * directly via react-native-blob-util and opens the local file through
 * its own explicit `application/pdf` Android intent - neither header from
 * this response is consulted there.
 */
export function cleanResponseHeaders(upstream: Response, filename: string | null, contentType?: string): Headers {
  const headers = new Headers({
    'Content-Type': contentType ?? upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    'Accept-Ranges': upstream.headers.get('accept-ranges') ?? 'bytes',
  });
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers.set('Content-Range', contentRange);
  if (filename) {
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  }
  return headers;
}

async function handleDrive(fileId: string, filename: string | null, resourceKey: string | null): Promise<Response> {
  if (!DRIVE_ID_PATTERN.test(fileId)) {
    return new Response('Invalid file id', { status: 400 });
  }
  if (resourceKey && !DRIVE_RESOURCE_KEY_PATTERN.test(resourceKey)) {
    return new Response('Invalid resource key', { status: 400 });
  }
  const upstream = await fetchFromDrive(fileId, resourceKey);
  if (!upstream.ok) {
    return new Response(`Upstream fetch failed with status ${upstream.status}`, { status: 502 });
  }
  // /drive/:fileId only ever serves the mugah/biltiMugah/maamorim/hagahos/hosofos
  // PDF links packages/catalog extracts - always a PDF, so force the type
  // rather than trust Drive's generic upstream content-type.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: cleanResponseHeaders(upstream, filename, 'application/pdf'),
  });
}

async function handleJemAudio(filename: string, range: string | null): Promise<Response> {
  if (!JEM_AUDIO_FILENAME_PATTERN.test(filename)) {
    return new Response('Invalid audio filename', { status: 400 });
  }
  const upstream = await fetchFromJemAudioCdn(filename, range);
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream fetch failed with status ${upstream.status}`, { status: 502 });
  }
  return new Response(upstream.body, { status: upstream.status, headers: cleanResponseHeaders(upstream, null) });
}

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const range = request.headers.get('Range');

    // Only whole-file responses go through the simple Phase-1 cache - a
    // ranged request always round-trips live, so a player seeking within a
    // track never risks getting served a mismatched cached slice. The
    // cached copy already carries CORS headers (added below before it's
    // stored), so a cache hit needs no extra wrapping.
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    if (!range) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    }

    let response: Response;
    const driveMatch = /^\/drive\/([^/]+)$/.exec(url.pathname);
    const jemAudioMatch = /^\/jem-audio\/([^/]+)$/.exec(url.pathname);
    if (driveMatch) {
      response = await handleDrive(driveMatch[1]!, url.searchParams.get('filename'), url.searchParams.get('resourcekey'));
    } else if (jemAudioMatch) {
      response = await handleJemAudio(jemAudioMatch[1]!, range);
    } else {
      response = new Response('Not found', { status: 404 });
    }

    response = withCors(response);
    if (!range && response.status === 200) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  },
};
