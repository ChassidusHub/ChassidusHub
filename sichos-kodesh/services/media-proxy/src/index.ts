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
export const JEM_AUDIO_FILENAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}\.(mp3|m4a|opus)$/;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days - Phase 1's only caching until R2 lands
const JEM_AUDIO_CDN_BASE = 'https://dtgj2yu3gmlic.cloudfront.net';

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

/** JEM's CloudFront distribution serves audio directly - no interstitial, no auth. Confirmed live. `range` is forwarded as-is so a player can seek within a track. */
export async function fetchFromJemAudioCdn(filename: string, range?: string | null): Promise<Response> {
  return fetch(`${JEM_AUDIO_CDN_BASE}/${filename}`, range ? { headers: { Range: range } } : undefined);
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
 */
function cleanResponseHeaders(upstream: Response, filename: string | null): Headers {
  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    'Accept-Ranges': upstream.headers.get('accept-ranges') ?? 'bytes',
  });
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers.set('Content-Range', contentRange);
  if (filename) {
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  }
  return headers;
}

async function handleDrive(fileId: string, filename: string | null): Promise<Response> {
  if (!DRIVE_ID_PATTERN.test(fileId)) {
    return new Response('Invalid file id', { status: 400 });
  }
  const upstream = await fetchFromDrive(fileId);
  if (!upstream.ok) {
    return new Response(`Upstream fetch failed with status ${upstream.status}`, { status: 502 });
  }
  return new Response(upstream.body, { status: upstream.status, headers: cleanResponseHeaders(upstream, filename) });
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
    const url = new URL(request.url);
    const range = request.headers.get('Range');

    // Only whole-file responses go through the simple Phase-1 cache - a
    // ranged request always round-trips live, so a player seeking within a
    // track never risks getting served a mismatched cached slice.
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
      response = await handleDrive(driveMatch[1]!, url.searchParams.get('filename'));
    } else if (jemAudioMatch) {
      response = await handleJemAudio(jemAudioMatch[1]!, range);
    } else {
      return new Response('Not found', { status: 404 });
    }

    if (!range && response.status === 200) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  },
};
