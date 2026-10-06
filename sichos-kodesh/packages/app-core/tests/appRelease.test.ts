import { describe, expect, it } from 'vitest';
import type { LatestAppRelease } from '../src/appRelease/appRelease.js';
import { UPDATE_SNOOZE_MS, appFileUrl, compareVersions, fetchLatestAppRelease, parseLatestAppRelease, pickAppFile, shouldPromptUpdate } from '../src/appRelease/appRelease.js';

const release: LatestAppRelease = {
  schema: 1,
  platform: 'android',
  version: '1.13.0',
  versionCode: 14,
  publishedAt: '2026-09-25T12:00:00.000Z',
  notes: { he: ['עדכון'], en: ['An update'] },
  files: [
    { abi: 'arm64-v8a', file: 'sichos-kodesh-1.13.0-arm64-v8a.apk', bytes: 25_000_000, sha256: 'a'.repeat(64), path: '/v1/app/android/download/arm64-v8a' },
    { abi: 'armeabi-v7a', file: 'sichos-kodesh-1.13.0-armeabi-v7a.apk', bytes: 24_000_000, sha256: 'b'.repeat(64), path: '/v1/app/android/download/armeabi-v7a' },
    { abi: 'universal', file: 'sichos-kodesh-1.13.0-universal.apk', bytes: 33_000_000, sha256: 'c'.repeat(64), path: '/v1/app/android/download/universal' },
  ],
};

describe('the app release on the server', () => {
  it('compares versions by number, not as text', () => {
    expect(compareVersions('1.13.0', '1.12.0')).toBeGreaterThan(0);
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('junk', '1.0.0')).toBeLessThan(0);
  });

  it('reads latest.json and refuses anything else', () => {
    expect(parseLatestAppRelease(JSON.parse(JSON.stringify(release)))).toEqual(release);
    expect(parseLatestAppRelease({ ...release, version: 'v1.13' })).toBeNull();
    expect(parseLatestAppRelease({ ...release, files: [{ abi: 'x86' }] })).toBeNull();
    expect(parseLatestAppRelease('<html>')).toBeNull();
    expect(parseLatestAppRelease({ ...release, notes: undefined })).toMatchObject({ notes: { he: [], en: [] } });
  });

  it("picks the phone's own APK, the universal one when it has none", () => {
    expect(pickAppFile(release, ['arm64-v8a', 'armeabi-v7a', 'armeabi'])!.abi).toBe('arm64-v8a');
    expect(pickAppFile(release, ['armeabi-v7a', 'armeabi'])!.abi).toBe('armeabi-v7a');
    expect(pickAppFile(release, ['x86_64'])!.abi).toBe('universal');
    expect(appFileUrl(release.files[0]!)).toBe('https://api.sk.shmuky.dev/v1/app/android/download/arm64-v8a');
  });

  it('asks about a newer version, and after "later" not again for a few days', () => {
    const now = Date.parse('2026-09-26T00:00:00Z');
    expect(shouldPromptUpdate(release, '1.12.0', null, now)).toBe(true);
    expect(shouldPromptUpdate(release, '1.13.0', null, now)).toBe(false);
    expect(shouldPromptUpdate(release, '1.14.0', null, now)).toBe(false);
    expect(shouldPromptUpdate(null, '1.12.0', null, now)).toBe(false);
    expect(shouldPromptUpdate(release, '1.12.0', { version: '1.13.0', dismissedAt: now - 1000 }, now)).toBe(false);
    expect(shouldPromptUpdate(release, '1.12.0', { version: '1.13.0', dismissedAt: now - UPDATE_SNOOZE_MS }, now)).toBe(true);
    expect(shouldPromptUpdate(release, '1.12.0', { version: '1.12.5', dismissedAt: now }, now)).toBe(true);
  });

  it('fetches it without ever throwing', async () => {
    const asked: string[] = [];
    const ok = await fetchLatestAppRelease({ fetchFn: async (url) => (asked.push(url), { ok: true, status: 200, json: async () => release }) });
    expect(ok?.version).toBe('1.13.0');
    expect(asked).toEqual(['https://api.sk.shmuky.dev/v1/app/android/latest.json']);
    expect(await fetchLatestAppRelease({ fetchFn: async () => ({ ok: false, status: 404, json: async () => ({}) }) })).toBeNull();
    expect(
      await fetchLatestAppRelease({
        fetchFn: async () => {
          throw new Error('offline');
        },
      }),
    ).toBeNull();
  });
});
