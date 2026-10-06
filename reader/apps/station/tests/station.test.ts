import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import type { HaveFile, DeviceFile, ObjectsIndex } from '@chassidushub-reader/pack-format';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@chassidushub-reader/app-core';
import { canonicalBytes, crc32, generateKeyPair, sourceKey } from '@chassidushub-reader/pack-format';
import type { PublishMeta, YearShard } from '@chassidushub-reader/pack-api';
import { createHandler, memoryStore, publishKeys } from '@chassidushub-reader/pack-api';
import type { StationConfig } from '../src/config.js';
import { DEFAULT_CONFIG, configProblems, parseStationConfig, parseTrustPairs } from '../src/config.js';
import { packApi } from '../src/api.js';
import { mirrorPaths, readMirrorIndex, syncMirror } from '../src/mirror.js';
import { directoryPhone, findSharedFolder, loadPhone, planPhone, readPhoneState } from '../src/phone.js';
import { occasionFolder, writePlayerFolders } from '../src/player.js';
import { copyApkTo, syncApk } from '../src/apk.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const catalog5736 = JSON.parse(await readFile(path.resolve(here, '../../mobile/src/catalog/data/5736.json'), 'utf8')) as CatalogEntry[];
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const key = generateKeyPair(new Uint8Array(32).fill(7));

/** A published archive (the pack API's layout) of Tishrei 5736's first four farbrengens, as made-up bytes. */
function publish(publishedAt = '2026-09-24T08:00:00.000Z') {
  const files = new Map<string, Uint8Array>();
  const entries = catalog5736.filter((entry) => entry.hebrewDate.startsWith('5736-01-') && entry.audio.length > 0).slice(0, 4);
  const index: ObjectsIndex = { schema: 1, version: '1.2.0', builtAt: '2026-09-24T00:00:00.000Z', objects: {} };
  const crcs: Record<string, number> = {};
  const seen = new Set<string>();
  let n = 0;
  for (const target of listDownloadTargets(entries, ALL_CONTENT_TYPES)) {
    const sourceId = target.kind === 'audio' ? target.workerFilename! : target.driveFileId!;
    const k = sourceKey(target.kind, sourceId, target.kind === 'audio' ? 'src' : undefined);
    if (seen.has(k)) continue;
    seen.add(k);
    n += 1;
    const bytes = new Uint8Array(2000 + n * 331).map((_, i) => (i * 7 + n) % 256);
    const sha = sha256(bytes);
    index.objects[sha] = { kind: target.kind, ...(target.kind === 'audio' ? { profile: 'src' as const } : {}), bytes: bytes.length, sourceId, collection: 'farbrengens', itemId: String(target.occasionId) };
    crcs[sha] = crc32(bytes);
    files.set(publishKeys.object(sha), bytes);
  }
  const indexBytes = canonicalBytes(index);
  const meta: PublishMeta = {
    schema: 1,
    catalogVersion: '1.2.0',
    publishedAt,
    years: [5736],
    profiles: ['src'],
    objectsIndex: { sha256: sha256(indexBytes), bytes: indexBytes.length, crc32: crc32(indexBytes) },
    objects: Object.keys(index.objects).length,
    bytes: Object.values(index.objects).reduce((sum, o) => sum + o.bytes, 0),
  };
  const shard: YearShard = { index, crc32: crcs };
  files.set(publishKeys.meta, encode(meta));
  files.set(publishKeys.catalogYear(5736), encode(entries));
  files.set(publishKeys.yearShard(5736), encode(shard));
  files.set(publishKeys.objectsIndex, indexBytes);
  return { store: memoryStore(files), index, entries };
}

function api(options: { publishedAt?: string; signed?: boolean } = {}) {
  const published = publish(options.publishedAt);
  const handler = createHandler(published.store, { signingKey: options.signed === false ? null : key });
  let requests = 0;
  const client = packApi('https://packs.test', (url) => {
    requests += 1;
    return handler(new Request(url));
  });
  return { client, published, requests: () => requests };
}

const config = (overrides: Partial<StationConfig> = {}): StationConfig => ({
  ...DEFAULT_CONFIG,
  api: 'https://packs.test',
  scopes: ['5736-01'],
  sections: 'everything',
  trust: { [key.keyId]: key.publicKey },
  phoneReserveMb: 0,
  ...overrides,
});

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sk-station-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function phoneWith(have: string[] | null, freeBytes: number | null): Promise<string> {
  const dir = await tempDir();
  await mkdir(path.join(dir, 'state'), { recursive: true });
  if (have) {
    const file: HaveFile = { schema: 1, appVersion: '1.4.0', catalogVersion: '1.2.0', profiles: ['src'], writtenAt: '2026-09-24T09:00:00.000Z', objects: have };
    await writeFile(path.join(dir, 'state', 'have.json'), JSON.stringify(file));
  }
  if (freeBytes !== null) {
    const device: DeviceFile = { schema: 1, model: 'Test phone', androidVersion: '12', appVersion: '1.4.0', freeBytes };
    await writeFile(path.join(dir, 'state', 'device.json'), JSON.stringify(device));
  }
  return dir;
}

describe('station config', () => {
  it('reads station.json over the defaults and names what is wrong', () => {
    expect(parseStationConfig({ schema: 1, api: 'http://localhost:8787', scopes: ['5736'] })).toEqual({ ...DEFAULT_CONFIG, api: 'http://localhost:8787', scopes: ['5736'] });
    expect(parseStationConfig({ schema: 2, api: 'x' })).toBeNull();
    expect(configProblems(config())).toEqual([]);
    expect(configProblems(config({ api: 'nowhere', scopes: ['5736-13'], sections: 'songs' }))).toHaveLength(3);
  });

  it("reads --trust pairs, keeping a base64 key's padding", () => {
    expect(parseTrustPairs(['aee7120ee70a4ec0=khYWjS2lsOBGOyq/OqbtUCVaJgyGhqrIwrlVPGXzL0U='])).toEqual({ aee7120ee70a4ec0: 'khYWjS2lsOBGOyq/OqbtUCVaJgyGhqrIwrlVPGXzL0U=' });
    expect(() => parseTrustPairs(['=abc'])).toThrow();
    expect(() => parseTrustPairs(['abc'])).toThrow();
  });
});

describe('the mirror', () => {
  it('fetches each scope\'s packs, verifies and indexes them, and keeps them while the publish is unchanged', async () => {
    const root = await tempDir();
    const { client, published, requests } = api();
    const first = await syncMirror({ root, config: config(), api: client });
    expect(first.failed).toEqual([]);
    expect(first.downloaded).toEqual(['5736-01-tishrei-src.skpack']);
    expect(first.unsigned).toEqual([]);
    const index = (await readMirrorIndex(root))!;
    expect(index.packs).toHaveLength(1);
    expect(Object.keys(index.packs[0]!.objects).sort()).toEqual(Object.keys(published.index.objects).sort());
    expect(JSON.parse(await readFile(mirrorPaths(root).catalog(5736), 'utf8'))).toHaveLength(published.entries.length);

    const before = requests();
    const second = await syncMirror({ root, config: config(), api: client });
    expect(second.kept).toEqual(['5736-01-tishrei-src.skpack']);
    expect(second.downloaded).toEqual([]);
    // meta, size and the catalog year - no build.
    expect(requests() - before).toBe(3);
  });

  it('fetches again after a new publish, and drops a scope taken out of the config', async () => {
    const root = await tempDir();
    await syncMirror({ root, config: config({ scopes: ['5736-01', '5736'] }), api: api().client });
    expect((await readMirrorIndex(root))!.packs.map((p) => p.file).sort()).toEqual(['5736-01-tishrei-src.skpack', '5736-src.skpack']);
    const again = await syncMirror({ root, config: config(), api: api({ publishedAt: '2026-10-01T00:00:00.000Z' }).client });
    expect(again.downloaded).toEqual(['5736-01-tishrei-src.skpack']);
    expect(again.removed).toEqual(['5736-src.skpack']);
    expect(await readdir(mirrorPaths(root).packs)).toEqual(['5736-01-tishrei-src.skpack', 'index.json']);
  });

  it('refuses unsigned packs unless told to accept them', async () => {
    const root = await tempDir();
    const refused = await syncMirror({ root, config: config(), api: api({ signed: false }).client });
    expect(refused.failed).toHaveLength(1);
    expect(refused.failed[0]!.problem).toContain('signature');
    expect(refused.packs).toBe(0);
    const accepted = await syncMirror({ root, config: config({ acceptUnsigned: true }), api: api({ signed: false }).client });
    expect(accepted.unsigned).toEqual(['5736-01-tishrei-src.skpack']);
    expect(accepted.packs).toBe(1);
  });
});

describe('a phone', () => {
  async function mirror() {
    const root = await tempDir();
    const { client, published } = api();
    await syncMirror({ root, config: config(), api: client });
    return { root, index: (await readMirrorIndex(root))!, published };
  }

  it('gets the pack that brings it something new, copied whole into import/', async () => {
    const { root, index, published } = await mirror();
    const shas = Object.keys(published.index.objects);
    const phoneDir = await phoneWith(shas.slice(0, 3), 10 * 1024 ** 3);
    const phone = directoryPhone(phoneDir);
    const plan = planPhone(index, await readPhoneState(phone), { reserveBytes: 0 });
    expect(plan.copy).toHaveLength(1);
    expect(plan.copy[0]!.delta.missing).toHaveLength(shas.length - 3);
    expect(plan.summary).toMatch(/^טען תשרי תשל״ו · \d+ KB$/);
    expect(plan.warnings).toEqual([]);

    const report = await loadPhone(plan, mirrorPaths(root).packs, phone);
    expect(report.copied).toEqual(['5736-01-tishrei-src.skpack']);
    expect(await readdir(path.join(phoneDir, 'import'))).toEqual(['5736-01-tishrei-src.skpack']);
    const copied = await readFile(path.join(phoneDir, 'import', '5736-01-tishrei-src.skpack'));
    expect(sha256(copied)).toBe(index.packs[0]!.sha256);

    // The pack now waits in import/: loading again copies nothing.
    const again = planPhone(index, await readPhoneState(phone), { reserveBytes: 0 });
    expect(again.copy).toEqual([]);
    expect(again.summary).toContain('ממתינות לייבוא');
  });

  it('is up to date when it holds every object, and short of room when the pack does not fit', async () => {
    const { index, published } = await mirror();
    const shas = Object.keys(published.index.objects);
    const full = planPhone(index, await readPhoneState(directoryPhone(await phoneWith(shas, 10 * 1024 ** 3))), { reserveBytes: 0 });
    expect(full.copy).toEqual([]);
    expect(full.summary).toBe('הטלפון מעודכן');
    const empty = planPhone({ ...index, packs: [] }, await readPhoneState(directoryPhone(await phoneWith([], 1000))), { reserveBytes: 0 });
    expect(empty.summary).toContain('אין חבילות');

    const small = planPhone(index, await readPhoneState(directoryPhone(await phoneWith([], 1000))), { reserveBytes: 0 });
    expect(small.copy).toEqual([]);
    expect(small.noRoom).toHaveLength(1);
    expect(small.summary).toContain('אין מקום בטלפון');
    // The reserve counts too.
    const reserved = planPhone(index, await readPhoneState(directoryPhone(await phoneWith([], 10 * 1024 ** 2))), { reserveBytes: 10 * 1024 ** 2 });
    expect(reserved.copy).toEqual([]);
  });

  it('warns when the app has not written its state yet, and still plans', async () => {
    const { index } = await mirror();
    const plan = planPhone(index, await readPhoneState(directoryPhone(await phoneWith(null, null))), { reserveBytes: 0 });
    expect(plan.copy).toHaveLength(1);
    expect(plan.freeAfter).toBeNull();
    expect(plan.warnings).toHaveLength(2);
  });

  it('finds the shared folder under a storage root', async () => {
    const storage = await tempDir();
    const shared = path.join(storage, 'Documents', 'ChassidusHub');
    await mkdir(path.join(shared, 'state'), { recursive: true });
    expect(await findSharedFolder(storage)).toBe(shared);
    expect(await findSharedFolder(shared)).toBe(shared);
    expect(await findSharedFolder(await tempDir())).toBeNull();
  });
});

describe('player mode', () => {
  it('writes every recording as an MP3 in dated Hebrew folders that sort in order, once', async () => {
    const root = await tempDir();
    const { client, published } = api();
    await syncMirror({ root, config: config(), api: client });
    const index = (await readMirrorIndex(root))!;
    const out = await tempDir();
    const report = await writePlayerFolders({ root, index, out });
    const audioCount = published.entries.reduce((sum, entry) => sum + entry.audio.length, 0);
    expect(report.written).toBe(audioCount);
    expect(report.notMp3).toEqual([]);

    const first = published.entries[0]!;
    const folder = path.join(out, ...occasionFolder({ hebrewYear: first.hebrewYear, hebrewDate: first.hebrewDate, label: first.occasionLabel, itemId: String(first.occasionId) }).split('/'));
    expect(folder).toContain(path.join('ChassidusHub', '5736 תשל״ו', '01 תשרי'));
    const names = (await readdir(folder)).sort();
    expect(names).toHaveLength(first.audio.length);
    expect(names[0]).toMatch(/^01 .+\.mp3$/);
    // Hebrew chapter names, from the catalog.
    if (first.audio[0]!.chapterNameHe) expect(names[0]).toContain(first.audio[0]!.chapterNameHe.slice(0, 4));
    // The bytes are the object's.
    const bytes = await readFile(path.join(folder, names[0]!));
    expect(Object.keys(published.index.objects)).toContain(sha256(bytes));

    const again = await writePlayerFolders({ root, index, out });
    expect(again.written).toBe(0);
    expect(again.kept).toBe(audioCount);

    const otherMonth = await writePlayerFolders({ root, index, out: await tempDir(), scopes: ['5736-02'] });
    expect(otherMonth.written).toBe(0);
  });
});

describe('the app itself', () => {
  it("keeps the newest release's phone APKs from the app server and copies one into Download/", async () => {
    const root = await tempDir();
    const apk = new Uint8Array(5000).fill(1);
    const asked: string[] = [];
    const fetchFn = async (url: string) => {
      asked.push(url);
      if (url.endsWith('/v1/app/android/latest.json')) {
        return Response.json({
          schema: 1,
          platform: 'android',
          version: '1.13.0',
          versionCode: 14,
          publishedAt: '2026-09-25T12:00:00.000Z',
          notes: { he: [], en: [] },
          files: ['arm64-v8a', 'armeabi-v7a', 'universal'].map((abi) => ({ abi, file: `chassidushub-1.13.0-${abi}.apk`, bytes: apk.length, sha256: sha256(apk), path: `/v1/app/android/download/${abi}` })),
        });
      }
      return new Response(apk);
    };
    const report = await syncApk(root, fetchFn, 'https://app.test');
    expect(report.version).toBe('1.13.0');
    expect(report.downloaded.sort()).toEqual(['chassidushub-1.13.0-arm64-v8a.apk', 'chassidushub-1.13.0-armeabi-v7a.apk']);
    expect(asked).toContain('https://app.test/v1/app/android/download/arm64-v8a');
    expect(asked.some((url) => url.includes('github'))).toBe(false);
    expect((await syncApk(root, fetchFn, 'https://app.test')).kept).toHaveLength(2);
    const storage = await tempDir();
    const copied = await copyApkTo(root, storage);
    expect(copied).toBe(path.join(storage, 'Download', 'chassidushub-1.13.0-arm64-v8a.apk'));
    expect((await stat(copied)).size).toBe(apk.length);
  });

  it('refuses an APK whose bytes are not the ones the server listed', async () => {
    const root = await tempDir();
    const fetchFn = async (url: string) =>
      url.endsWith('latest.json')
        ? Response.json({ schema: 1, platform: 'android', version: '1.13.0', versionCode: 14, publishedAt: 'x', files: [{ abi: 'arm64-v8a', file: 'chassidushub-1.13.0-arm64-v8a.apk', bytes: 3, sha256: 'f'.repeat(64), path: '/v1/app/android/download/arm64-v8a' }] })
        : new Response(new Uint8Array([1, 2, 3]));
    await expect(syncApk(root, fetchFn, 'https://app.test')).rejects.toThrow(/sha256/);
  });
});
