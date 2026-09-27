import { createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Direct, polite fetching of upstream files: JEM's CloudFront and Google
 * Drive, never through the media proxy (it exists for the apps, not for a
 * 50 GB crawl). Two connections per host and about one request a second,
 * exponential backoff on 429/5xx and network errors, `Range` resume of a
 * partial download, conditional GET when we already have an ETag.
 */

export interface FetchOptions {
  /** Per host. */
  concurrency?: number;
  /** Minimum gap between request starts on one host. */
  minGapMs?: number;
  maxAttempts?: number;
  /** Base of the exponential backoff between attempts (1 s, 2 s, 4 s, ... capped at a minute); tests shrink it. */
  backoffBaseMs?: number;
  /** Tests point upstream hosts at a local fixture server. */
  rewriteUrl?: (url: string) => string;
  userAgent?: string;
  signal?: AbortSignal;
}

export type FetchOutcome =
  | { status: 'ok'; bytes: number; etag: string | null; lastModified: string | null; contentType: string | null; httpStatus: number }
  | { status: 'not-modified'; httpStatus: 304 }
  | { status: 'unresolved'; httpStatus: number; error: string }
  | { status: 'error'; httpStatus: number | null; error: string };

interface HostState {
  active: number;
  lastStart: number;
}

const hosts = new Map<string, HostState>();

async function acquire(host: string, concurrency: number, minGapMs: number): Promise<() => void> {
  let state = hosts.get(host);
  if (!state) {
    state = { active: 0, lastStart: 0 };
    hosts.set(host, state);
  }
  for (;;) {
    const wait = state.lastStart + minGapMs - Date.now();
    if (state.active < concurrency && wait <= 0) break;
    await sleep(Math.max(25, wait));
  }
  state.active += 1;
  state.lastStart = Date.now();
  const current = state;
  return () => {
    current.active -= 1;
  };
}

export function driveDownloadUrl(fileId: string, confirmToken?: string, resourceKey?: string | null): string {
  const url = new URL('https://drive.google.com/uc');
  url.searchParams.set('export', 'download');
  url.searchParams.set('id', fileId);
  if (confirmToken) url.searchParams.set('confirm', confirmToken);
  if (resourceKey) url.searchParams.set('resourcekey', resourceKey);
  return url.toString();
}

export function extractConfirmToken(html: string): string | null {
  const match = html.match(/confirm=([0-9A-Za-z_-]+)/);
  return match ? match[1]! : null;
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status <= 599);
}

async function writeBody(response: Response, dest: string, append: boolean): Promise<number> {
  const stream = createWriteStream(dest, { flags: append ? 'a' : 'w' });
  let bytes = 0;
  try {
    if (!response.body) throw new Error('empty body');
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      bytes += chunk.byteLength;
      if (!stream.write(chunk)) await new Promise<void>((resolve) => stream.once('drain', resolve));
    }
  } finally {
    await new Promise<void>((resolve, reject) => stream.end((err: Error | null | undefined) => (err ? reject(err) : resolve())));
  }
  return bytes;
}

/**
 * Downloads `url` into `dest` (a `.part` path the caller owns). Resumes
 * when `dest` already has bytes and the server honours `Range`; otherwise
 * starts over. Returns without throwing; a non-retryable 4xx is
 * `unresolved` (the file is gone or private), anything else that failed
 * after the retries is `error`.
 */
export async function fetchToFile(url: string, dest: string, options: FetchOptions = {}, conditional: { etag?: string | null } = {}): Promise<FetchOutcome> {
  const target = options.rewriteUrl ? options.rewriteUrl(url) : url;
  const host = new URL(target).host;
  const concurrency = options.concurrency ?? 2;
  const minGapMs = options.minGapMs ?? 1000;
  const maxAttempts = options.maxAttempts ?? 5;
  const backoffBaseMs = options.backoffBaseMs ?? 1000;
  let lastError: FetchOutcome = { status: 'error', httpStatus: null, error: 'no attempts' };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const release = await acquire(host, concurrency, minGapMs);
    try {
      let resumeFrom = 0;
      try {
        resumeFrom = (await stat(dest)).size;
      } catch {
        resumeFrom = 0;
      }
      const headers: Record<string, string> = { 'user-agent': options.userAgent ?? 'sichos-kodesh-archive/0.1 (+https://github.com/shmuky/Sichos-Kodesh)' };
      if (resumeFrom > 0) headers.range = `bytes=${resumeFrom}-`;
      else if (conditional.etag) headers['if-none-match'] = conditional.etag;
      const response = await fetch(target, { headers, redirect: 'follow', signal: options.signal });
      if (response.status === 304) return { status: 'not-modified', httpStatus: 304 };
      if (response.status === 416) {
        await unlink(dest).catch(() => undefined);
        lastError = { status: 'error', httpStatus: 416, error: 'range not satisfiable; restarting' };
        continue;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        if (isRetryable(response.status)) {
          lastError = { status: 'error', httpStatus: response.status, error: `HTTP ${response.status}` };
          await sleep(Math.min(60_000, backoffBaseMs * 2 ** attempt));
          continue;
        }
        return { status: 'unresolved', httpStatus: response.status, error: `HTTP ${response.status}${body ? `: ${body.slice(0, 120)}` : ''}` };
      }
      const append = response.status === 206 && resumeFrom > 0;
      if (!append && resumeFrom > 0) await unlink(dest).catch(() => undefined);
      const written = await writeBody(response, dest, append);
      const bytes = (append ? resumeFrom : 0) + written;
      const length = response.headers.get('content-length');
      if (length && Number(length) !== written) {
        lastError = { status: 'error', httpStatus: response.status, error: `short body: ${written} of ${length}` };
        continue; // the next attempt resumes from what was written
      }
      return {
        status: 'ok',
        bytes,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        contentType: response.headers.get('content-type'),
        httpStatus: response.status,
      };
    } catch (error) {
      lastError = { status: 'error', httpStatus: null, error: error instanceof Error ? error.message : String(error) };
      if (options.signal?.aborted) return lastError;
      await sleep(Math.min(60_000, backoffBaseMs * 2 ** attempt));
    } finally {
      release();
    }
  }
  return lastError;
}

/**
 * A JEM recording: the name ccdb gives it ends in .mp3, but every
 * "AR"-prefixed recording is on the CDN only as .m4a (and .opus) - the
 * media proxy falls back the same way. So a 404 on the .mp3 tries the
 * .m4a, then the .opus; the file keeps the catalog's name either way.
 */
export async function fetchJemToFile(url: string, dest: string, options: FetchOptions = {}, conditional: { etag?: string | null } = {}): Promise<FetchOutcome> {
  const first = await fetchToFile(url, dest, options, conditional);
  if (first.status !== 'unresolved' || first.httpStatus !== 404 || !/\.mp3$/i.test(url)) return first;
  for (const [ext, mime] of [
    ['m4a', 'audio/mp4'],
    ['opus', 'audio/ogg'],
  ] as const) {
    await unlink(dest).catch(() => undefined);
    const alt = await fetchToFile(url.replace(/\.mp3$/i, `.${ext}`), dest, options);
    if (alt.status === 'ok') return { ...alt, contentType: mime };
    if (alt.status !== 'unresolved') return alt;
  }
  return first;
}

/**
 * Google Drive: a small public file comes back directly; a large one comes
 * back as an HTML "can't scan for viruses" page with a confirm token to
 * re-request with; a private or deleted one comes back as HTML without a
 * token (or a 404). HTML that is not the interstitial means unresolved.
 */
export async function fetchDriveToFile(fileId: string, resourceKey: string | null, dest: string, options: FetchOptions = {}): Promise<FetchOutcome> {
  await unlink(dest).catch(() => undefined); // Drive does not do ranges for us; always whole
  const first = await fetchToFile(driveDownloadUrl(fileId, undefined, resourceKey), dest, { ...options });
  if (first.status !== 'ok') return first;
  if (!(first.contentType ?? '').includes('text/html')) return first;
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(dest, 'utf8');
  await unlink(dest).catch(() => undefined);
  const token = extractConfirmToken(html);
  if (!token) return { status: 'unresolved', httpStatus: first.httpStatus, error: /accounts\.google\.com|Sign in/i.test(html) ? 'Drive asks for sign-in (private or needs a resource key)' : 'Drive returned an HTML page instead of the file' };
  const second = await fetchToFile(driveDownloadUrl(fileId, token, resourceKey), dest, { ...options });
  if (second.status === 'ok' && (second.contentType ?? '').includes('text/html')) {
    await unlink(dest).catch(() => undefined);
    return { status: 'unresolved', httpStatus: second.httpStatus, error: 'Drive returned HTML again after the confirm token' };
  }
  return second;
}
