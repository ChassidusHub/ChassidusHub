import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseLatestAppRelease } from '@sichos-kodesh/app-core';
import type { AppBucket } from '../src/appRelease.js';
import { APP_LATEST_KEY, appObjectKey, createAppReleaseHandler, parseRange } from '../src/appRelease.js';
import type { Jwk } from '../src/oidc.js';
import { APP_RELEASE_POLICY, TokenError, verifyGithubToken } from '../src/oidc.js';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

/** R2 as a map: a stored stream is read whole, a sha256 checked like R2 does, and a listing comes two keys a page. */
function memoryBucket(): AppBucket & { files: Map<string, { bytes: Uint8Array; meta?: Record<string, string> }> } {
  const files = new Map<string, { bytes: Uint8Array; meta?: Record<string, string> }>();
  return {
    files,
    async get(key, options) {
      const file = files.get(key);
      if (!file) return null;
      const range = options?.range;
      const bytes = range ? file.bytes.subarray(range.offset, range.offset + (range.length ?? file.bytes.length)) : file.bytes;
      return { size: file.bytes.length, body: new Response(bytes.slice()).body! };
    },
    async head(key) {
      const file = files.get(key);
      return file ? { size: file.bytes.length, customMetadata: file.meta } : null;
    },
    async put(key, value, options) {
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(await new Response(value).arrayBuffer());
      if (options?.sha256 && sha256(bytes) !== options.sha256) throw new Error('sha256 mismatch');
      files.set(key, { bytes, meta: options?.customMetadata });
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) files.delete(key);
    },
    async list({ prefix, cursor }) {
      const all = [...files.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + 2);
      const truncated = start + 2 < all.length;
      return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? String(start + 2) : undefined };
    },
  };
}

/** A key pair standing in for GitHub's, and tokens signed with it. */
async function fakeGithub() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = { ...((await crypto.subtle.exportKey('jwk', pair.publicKey)) as Jwk), kid: 'test-key' };
  const now = Math.floor(Date.now() / 1000);
  async function token(claims: Record<string, unknown> = {}, kid = 'test-key'): Promise<string> {
    const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
    const payload = b64url(
      new TextEncoder().encode(
        JSON.stringify({
          iss: 'https://token.actions.githubusercontent.com',
          aud: 'sichos-kodesh-app-release',
          repository: 'shmuky/Sichos-Kodesh',
          ref: 'refs/tags/v1.13.0',
          workflow_ref: 'shmuky/Sichos-Kodesh/.github/workflows/android-release-apk.yml@refs/tags/v1.13.0',
          iat: now,
          nbf: now - 5,
          exp: now + 300,
          ...claims,
        }),
      ),
    );
    const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
    return `${header}.${payload}.${b64url(signature)}`;
  }
  const jwks = async () => [jwk];
  return { token, jwks };
}

const apk = (n: number, size: number) => new Uint8Array(size).map((_, i) => (i * 31 + n) % 256);

describe('GitHub OIDC tokens', () => {
  it('lets the release workflow in, from a version tag or main', async () => {
    const github = await fakeGithub();
    await expect(verifyGithubToken(await github.token(), APP_RELEASE_POLICY, github.jwks)).resolves.toMatchObject({ ref: 'refs/tags/v1.13.0' });
    await expect(verifyGithubToken(await github.token({ ref: 'refs/heads/main', repository: 'SHMUKY/sichos-kodesh' }), APP_RELEASE_POLICY, github.jwks)).resolves.toBeTruthy();
  });

  it('keeps everyone else out', async () => {
    const github = await fakeGithub();
    const refused = async (claims: Record<string, unknown>, pattern: RegExp) => {
      const error = await verifyGithubToken(await github.token(claims), APP_RELEASE_POLICY, github.jwks).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TokenError);
      expect((error as Error).message).toMatch(pattern);
    };
    await refused({ aud: 'something-else' }, /not for/);
    await refused({ repository: 'someone/fork' }, /another repository/);
    await refused({ ref: 'refs/heads/feature', workflow_ref: 'shmuky/Sichos-Kodesh/.github/workflows/android-release-apk.yml@refs/heads/feature' }, /version tag or main/);
    await refused({ workflow_ref: 'shmuky/Sichos-Kodesh/.github/workflows/other.yml@refs/tags/v1.13.0' }, /release workflow/);
    await refused({ exp: Math.floor(Date.now() / 1000) - 3600 }, /expired/);
    await refused({ iss: 'https://example.com' }, /not from GitHub/);
    const [h, p] = (await github.token()).split('.');
    const forged = `${h}.${p}.${b64url(new Uint8Array(256))}`;
    await expect(verifyGithubToken(forged, APP_RELEASE_POLICY, github.jwks)).rejects.toThrow(/signature/);
    await expect(verifyGithubToken(await github.token({}, 'unknown-key'), APP_RELEASE_POLICY, github.jwks)).rejects.toThrow(/no signing key/);
  });
});

describe('app releases on the server', () => {
  async function setup() {
    const github = await fakeGithub();
    const bucket = memoryBucket();
    const handler = createAppReleaseHandler(bucket, { verify: (token) => verifyGithubToken(token, APP_RELEASE_POLICY, github.jwks), now: () => new Date('2026-09-25T12:00:00Z') });
    const call = async (path: string, init: RequestInit = {}) => (await handler(new Request(`https://api.test${path}`, init)))!;
    const upload = async (token: string, version: string, abi: string, bytes: Uint8Array, sha = sha256(bytes)) =>
      call(`/v1/app/android/upload/${version}/${abi}`, { method: 'PUT', body: bytes.slice(), headers: { Authorization: `Bearer ${token}`, 'X-SK-Sha256': sha, 'Content-Length': String(bytes.length) } });
    const publish = async (token: string, body: unknown) => call('/v1/app/android/publish', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return { github, bucket, handler, call, upload, publish };
  }

  it('publishes a release, serves it, and keeps only the newest', async () => {
    const { github, bucket, call, upload, publish } = await setup();
    // What an earlier release left behind.
    bucket.files.set(appObjectKey('1.12.0', 'arm64-v8a'), { bytes: apk(0, 10) });
    const token = await github.token();
    const files = { 'arm64-v8a': apk(1, 5000), 'armeabi-v7a': apk(2, 4000), universal: apk(3, 9000) };
    for (const [abi, bytes] of Object.entries(files)) expect((await upload(token, '1.13.0', abi, bytes)).status).toBe(201);

    const published = await publish(token, { version: '1.13.0', versionCode: 14, notes: { he: ['עדכון'], en: ['An update'] } });
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ version: '1.13.0', removed: 1 });
    expect(bucket.files.has(appObjectKey('1.12.0', 'arm64-v8a'))).toBe(false);

    const latest = parseLatestAppRelease(await (await call('/v1/app/android/latest.json')).json());
    expect(latest).toMatchObject({ version: '1.13.0', versionCode: 14, publishedAt: '2026-09-25T12:00:00.000Z', notes: { he: ['עדכון'], en: ['An update'] } });
    expect(latest!.files).toEqual([
      { abi: 'arm64-v8a', file: 'sichos-kodesh-1.13.0-arm64-v8a.apk', bytes: 5000, sha256: sha256(files['arm64-v8a']), path: '/v1/app/android/download/arm64-v8a' },
      { abi: 'armeabi-v7a', file: 'sichos-kodesh-1.13.0-armeabi-v7a.apk', bytes: 4000, sha256: sha256(files['armeabi-v7a']), path: '/v1/app/android/download/armeabi-v7a' },
      { abi: 'universal', file: 'sichos-kodesh-1.13.0-universal.apk', bytes: 9000, sha256: sha256(files.universal), path: '/v1/app/android/download/universal' },
    ]);

    const whole = await call('/v1/app/android/download/arm64-v8a');
    expect(whole.status).toBe(200);
    expect(whole.headers.get('Content-Disposition')).toBe('attachment; filename="sichos-kodesh-1.13.0-arm64-v8a.apk"');
    expect(whole.headers.get('Content-Type')).toBe('application/vnd.android.package-archive');
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(files['arm64-v8a']);
    const part = await call('/v1/app/android/download/arm64-v8a', { headers: { Range: 'bytes=100-199' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('Content-Range')).toBe('bytes 100-199/5000');
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(files['arm64-v8a'].subarray(100, 200));
    expect((await call('/v1/app/android/download/x86')).status).toBe(404);
  });

  it('refuses what is not the release workflow, a wrong version or a broken file', async () => {
    const { github, call, upload, publish } = await setup();
    const token = await github.token();
    expect((await call('/v1/app/android/latest.json')).status).toBe(404);
    expect((await call('/v1/app/android/upload/1.13.0/arm64-v8a', { method: 'PUT', body: apk(1, 10) })).status).toBe(401);
    expect((await upload(await github.token({ repository: 'x/y' }), '1.13.0', 'arm64-v8a', apk(1, 10))).status).toBe(403);
    // The v1.13.0 tag's run publishes 1.13.0, nothing else.
    expect((await upload(token, '1.14.0', 'arm64-v8a', apk(1, 10))).status).toBe(403);
    expect((await upload(token, '1.13.0', 'arm64-v8a', apk(1, 10), 'f'.repeat(64))).status).toBe(400);
    expect((await publish(token, { version: '1.13.0', versionCode: 14 })).status).toBe(409);
    expect((await upload(token, '1.13.0', 'arm64-v8a', apk(1, 10))).status).toBe(201);
    expect((await publish(token, { version: '1.13.0', versionCode: 14 })).status).toBe(200);
    // A run started by hand on main may not go back to an older version.
    const main = await github.token({ ref: 'refs/heads/main', workflow_ref: 'shmuky/Sichos-Kodesh/.github/workflows/android-release-apk.yml@refs/heads/main' });
    expect((await upload(main, '1.12.0', 'arm64-v8a', apk(1, 10))).status).toBe(201);
    expect((await publish(main, { version: '1.12.0', versionCode: 13 })).status).toBe(409);
  });

  it('leaves every other path to the pack API', async () => {
    const { handler } = await setup();
    expect(await handler(new Request('https://api.test/v1/meta'))).toBeNull();
    expect(await handler(new Request(`https://api.test/${APP_LATEST_KEY}`))).toBeNull();
  });

  it('reads Range headers the way download managers send them', () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange('bytes=0-', 100)).toEqual({ offset: 0, length: 100 });
    expect(parseRange('bytes=90-200', 100)).toEqual({ offset: 90, length: 10 });
    expect(parseRange('bytes=-10', 100)).toEqual({ offset: 90, length: 10 });
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
  });
});
