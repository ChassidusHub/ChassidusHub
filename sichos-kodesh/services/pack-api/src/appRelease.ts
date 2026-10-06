import type { AppAbi, AppReleaseFile, LatestAppRelease } from '@sichos-kodesh/app-core';
import { APP_ABIS, appDownloadPath, appFileName, compareVersions, isAppAbi, isAppVersion, parseLatestAppRelease } from '@sichos-kodesh/app-core';
import type { GithubClaims } from './oidc.js';
import { TokenError } from './oidc.js';

/**
 * The phone app's releases, on the same R2 bucket as the archive:
 *
 *   GET  /v1/app/android/latest.json               the newest release (app-core's LatestAppRelease)
 *   GET  /v1/app/android/download/<abi>            its APK for that ABI (Range requests too)
 *   PUT  /v1/app/android/upload/<version>/<abi>    the release workflow uploads an APK
 *   POST /v1/app/android/publish                   ...then makes that version the newest
 *
 * Uploading and publishing take a GitHub Actions OIDC token from the
 * release workflow (oidc.ts). Publishing writes latest.json and then
 * removes every other version, so the bucket holds one release: the
 * download links never change, only what they serve.
 *
 *   app/android/latest.json
 *   app/android/<version>/sichos-kodesh-<version>-<abi>.apk
 */

export const APP_PREFIX = 'app/android/';
export const APP_LATEST_KEY = `${APP_PREFIX}latest.json`;
const APK_TYPE = 'application/vnd.android.package-archive';
/** Well above an APK (the universal one is ~35 MB) and under a Worker's request-body limit. */
const MAX_APK_BYTES = 95 * 1024 * 1024;

export function appObjectKey(version: string, abi: AppAbi): string {
  return `${APP_PREFIX}${version}/${appFileName(version, abi)}`;
}

/** The slice of R2 the app routes use (the Worker's ARCHIVE binding, a map in the tests). */
export interface AppBucket {
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
  head(key: string): Promise<{ size: number; customMetadata?: Record<string, string> } | null>;
  put(key: string, value: ReadableStream<Uint8Array> | string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string>; sha256?: string }): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
}

export interface AppReleaseOptions {
  /** Checks a bearer token; throws TokenError when it may not publish (oidc.ts's verifyGithubToken). */
  verify: (token: string) => Promise<GithubClaims>;
  now?: () => Date;
}

class AppHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

async function readLatest(bucket: AppBucket): Promise<LatestAppRelease | null> {
  const object = await bucket.get(APP_LATEST_KEY);
  if (!object) return null;
  try {
    return parseLatestAppRelease(JSON.parse(await new Response(object.body).text()));
  } catch {
    return null;
  }
}

/** `bytes=a-b`, `bytes=a-` or `bytes=-n` against `size`; null for no range, 'unsatisfiable' for one past the end. */
export function parseRange(header: string | null, size: number): { offset: number; length: number } | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { offset: start, length: end - start + 1 };
}

async function authorize(request: Request, options: AppReleaseOptions): Promise<GithubClaims> {
  const header = request.headers.get('Authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (!token) throw new AppHttpError(401, 'a GitHub Actions token is required');
  try {
    return await options.verify(token);
  } catch (error) {
    if (error instanceof TokenError) throw new AppHttpError(403, error.message);
    throw error;
  }
}

/** A tag run publishes its own version only; a run started by hand on main names its version itself. */
function checkRefMatches(claims: GithubClaims, version: string): void {
  if (claims.ref.startsWith('refs/tags/') && claims.ref !== `refs/tags/sk-v${version}`) throw new AppHttpError(403, `the ${claims.ref} run cannot publish ${version}`);
}

async function download(request: Request, bucket: AppBucket, abi: AppAbi): Promise<Response> {
  const latest = await readLatest(bucket);
  const file = latest?.files.find((f) => f.abi === abi);
  if (!latest || !file) throw new AppHttpError(404, latest ? `the newest release has no ${abi} APK` : 'no release is published yet');
  const key = appObjectKey(latest.version, abi);
  const headers: Record<string, string> = {
    'Content-Type': APK_TYPE,
    'Content-Disposition': `attachment; filename="${file.file}"`,
    'Accept-Ranges': 'bytes',
    ETag: `"${file.sha256}"`,
    // The link stays, what it serves moves on with each release.
    'Cache-Control': 'public, max-age=300',
  };
  const range = parseRange(request.headers.get('Range'), file.bytes);
  if (range === 'unsatisfiable') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${file.bytes}` } });
  if (request.method === 'HEAD') return new Response(null, { headers: { ...headers, 'Content-Length': String(file.bytes) } });
  const object = await bucket.get(key, range ? { range } : undefined);
  if (!object) throw new AppHttpError(404, `${file.file} is missing on the server`);
  if (range) {
    return new Response(object.body, { status: 206, headers: { ...headers, 'Content-Length': String(range.length), 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${file.bytes}` } });
  }
  return new Response(object.body, { headers: { ...headers, 'Content-Length': String(file.bytes) } });
}

async function upload(request: Request, bucket: AppBucket, options: AppReleaseOptions, version: string, abi: AppAbi): Promise<Response> {
  const claims = await authorize(request, options);
  checkRefMatches(claims, version);
  const sha256 = (request.headers.get('X-SK-Sha256') ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new AppHttpError(400, 'X-SK-Sha256 must be the APK\'s sha256');
  const length = Number(request.headers.get('Content-Length'));
  if (!(length > 0)) throw new AppHttpError(411, 'Content-Length is required');
  if (length > MAX_APK_BYTES) throw new AppHttpError(413, `an APK over ${MAX_APK_BYTES} bytes is not an APK`);
  if (!request.body) throw new AppHttpError(400, 'the APK is missing');
  const key = appObjectKey(version, abi);
  // R2 checks the sha256 as it stores the bytes and refuses a mismatch.
  try {
    await bucket.put(key, request.body, { httpMetadata: { contentType: APK_TYPE }, customMetadata: { sha256 }, sha256 });
  } catch (error) {
    throw new AppHttpError(400, `the upload was not stored (${error instanceof Error ? error.message : String(error)}): a broken transfer or a wrong sha256`);
  }
  const stored = await bucket.head(key);
  if (!stored || stored.size !== length) throw new AppHttpError(400, `stored ${stored?.size ?? 0} of ${length} bytes`);
  return json({ key, bytes: stored.size, sha256 }, 201);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string').slice(0, 40) : [];
}

async function publish(request: Request, bucket: AppBucket, options: AppReleaseOptions): Promise<Response> {
  const claims = await authorize(request, options);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    throw new AppHttpError(400, 'the body must be JSON');
  }
  const version = typeof body.version === 'string' ? body.version : '';
  if (!isAppVersion(version)) throw new AppHttpError(400, 'version must be x.y.z');
  const versionCode = Number(body.versionCode);
  if (!Number.isInteger(versionCode) || versionCode < 1) throw new AppHttpError(400, 'versionCode must be a positive whole number');
  checkRefMatches(claims, version);

  const current = await readLatest(bucket);
  if (current && compareVersions(version, current.version) < 0) throw new AppHttpError(409, `${current.version} is already out; ${version} is older`);

  const files: AppReleaseFile[] = [];
  for (const abi of APP_ABIS) {
    const head = await bucket.head(appObjectKey(version, abi));
    if (!head) continue;
    files.push({ abi, file: appFileName(version, abi), bytes: head.size, sha256: head.customMetadata?.sha256 ?? '', path: appDownloadPath(abi) });
  }
  if (!files.some((f) => f.abi === 'arm64-v8a')) throw new AppHttpError(409, `upload the ${version} APKs first (at least arm64-v8a)`);
  const notes = (body.notes ?? {}) as Record<string, unknown>;
  const latest: LatestAppRelease = {
    schema: 1,
    platform: 'android',
    version,
    versionCode,
    publishedAt: (options.now ?? (() => new Date()))().toISOString(),
    notes: { he: stringList(notes.he), en: stringList(notes.en) },
    files,
  };
  await bucket.put(APP_LATEST_KEY, JSON.stringify(latest, null, 2), { httpMetadata: { contentType: 'application/json; charset=utf-8' } });

  // Only the newest stays: everything else under app/android/ goes, now that latest.json no longer points at it.
  const keep = `${APP_PREFIX}${version}/`;
  const stale: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: APP_PREFIX, cursor });
    for (const object of page.objects) if (object.key !== APP_LATEST_KEY && !object.key.startsWith(keep)) stale.push(object.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < stale.length; i += 1000) await bucket.delete(stale.slice(i, i + 1000));
  return json({ ...latest, removed: stale.length }, 200);
}

/** The app routes' handler: a response for `/v1/app/...`, null for any other path. */
export function createAppReleaseHandler(bucket: AppBucket, options: AppReleaseOptions): (request: Request) => Promise<Response | null> {
  async function route(request: Request, path: string): Promise<Response> {
    const method = request.method;
    if (path === '/v1/app/android/latest.json') {
      if (method !== 'GET' && method !== 'HEAD') throw new AppHttpError(405, 'only GET');
      const latest = await readLatest(bucket);
      if (!latest) throw new AppHttpError(404, 'no release is published yet');
      return new Response(method === 'HEAD' ? null : JSON.stringify(latest), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    }
    const downloadMatch = /^\/v1\/app\/android\/download\/([a-z0-9-]+)$/.exec(path);
    if (downloadMatch) {
      if (method !== 'GET' && method !== 'HEAD') throw new AppHttpError(405, 'only GET');
      const abi = downloadMatch[1]!;
      if (!isAppAbi(abi)) throw new AppHttpError(404, `no APK for "${abi}" (${APP_ABIS.join(', ')})`);
      return download(request, bucket, abi);
    }
    const uploadMatch = /^\/v1\/app\/android\/upload\/([0-9.]+)\/([a-z0-9-]+)$/.exec(path);
    if (uploadMatch) {
      if (method !== 'PUT') throw new AppHttpError(405, 'only PUT');
      const [, version, abi] = uploadMatch as unknown as [string, string, string];
      if (!isAppVersion(version) || !isAppAbi(abi)) throw new AppHttpError(404, 'upload/<x.y.z>/<abi>');
      return upload(request, bucket, options, version, abi);
    }
    if (path === '/v1/app/android/publish') {
      if (method !== 'POST') throw new AppHttpError(405, 'only POST');
      return publish(request, bucket, options);
    }
    throw new AppHttpError(404, 'not found');
  }

  return async (request) => {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (!path.startsWith('/v1/app/')) return null;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range' } });
    try {
      return await route(request, path);
    } catch (error) {
      const status = error instanceof AppHttpError ? error.status : 500;
      return json({ error: error instanceof Error ? error.message : String(error) }, status);
    }
  };
}
