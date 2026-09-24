import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { ObjectsIndex, PackManifest } from '@sichos-kodesh/pack-format';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@sichos-kodesh/app-core';
import { canonicalBytes, crc32, generateKeyPair, parsePackManifest, sourceKey, verifyManifest } from '@sichos-kodesh/pack-format';
import { createHandler } from '../src/handler.js';
import type { PublishMeta, YearShard } from '../src/layout.js';
import { publishKeys } from '../src/layout.js';
import { memoryStore } from '../src/store.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const catalog5736 = JSON.parse(readFileSync(path.resolve(here, '../../../apps/mobile/src/catalog/data/5736.json'), 'utf8')) as CatalogEntry[];
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const key = generateKeyPair(new Uint8Array(32).fill(9));

/** A published archive holding every file of Tishrei 5736's first three farbrengens, as made-up bytes. */
function publish(options: { truncate?: boolean } = {}) {
  const files = new Map<string, Uint8Array>();
  const entries = catalog5736.filter((entry) => entry.hebrewDate.startsWith('5736-01-')).slice(0, 3);
  const index: ObjectsIndex = { schema: 1, version: '1.1.0', builtAt: '2026-09-24T00:00:00.000Z', objects: {} };
  const crcs: Record<string, number> = {};
  let n = 0;
  const seen = new Set<string>();
  for (const target of listDownloadTargets(entries, ALL_CONTENT_TYPES)) {
    const upstream = target.kind === 'audio' ? target.workerFilename! : target.driveFileId!;
    if (seen.has(sourceKey(target.kind, upstream, target.kind === 'audio' ? 'src' : undefined))) continue; // one file, two targets
    seen.add(sourceKey(target.kind, upstream, target.kind === 'audio' ? 'src' : undefined));
    n += 1;
    const bytes = new Uint8Array(3000 + n * 997).map((_, i) => (i * 13 + n) % 256);
    const sha = sha256(bytes);
    const sourceId = target.kind === 'audio' ? target.workerFilename! : target.driveFileId!;
    index.objects[sha] = { kind: target.kind, ...(target.kind === 'audio' ? { profile: 'src' as const } : {}), bytes: bytes.length, sourceId, collection: 'farbrengens', itemId: String(target.occasionId) };
    crcs[sha] = crc32(bytes);
    files.set(publishKeys.object(sha), options.truncate && n === 2 ? bytes.subarray(0, 100) : bytes);
  }
  const indexBytes = canonicalBytes(index);
  const meta: PublishMeta = {
    schema: 1,
    catalogVersion: '1.1.0',
    publishedAt: '2026-09-24T08:00:00.000Z',
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
  return { store: memoryStore(files), files, index, entries, meta };
}

/** Walks a stored ZIP's local headers: every entry's name and bytes, in order. */
function readZip(bytes: Uint8Array): Array<{ name: string; data: Uint8Array; crc: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Array<{ name: string; data: Uint8Array; crc: number }> = [];
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    expect(view.getUint16(at + 8, true)).toBe(0); // stored
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength + extraLength;
    out.push({ name, data: bytes.subarray(start, start + size), crc });
    at = start + size;
  }
  expect(view.getUint32(at, true)).toBe(0x02014b50);
  return out;
}

const get = (handler: (r: Request) => Promise<Response>, path: string) => handler(new Request(`https://packs.test${path}`));

describe('pack API', () => {
  it('sizes a selection exactly, with its parts', async () => {
    const { store, index } = publish();
    const handler = createHandler(store, { signingKey: key });
    const response = await get(handler, '/v1/size?scope=5736-01&sections=everything');
    expect(response.status).toBe(200);
    const size = (await response.json()) as { bytes: number; objects: number; parts: Array<{ file: string }>; missing: number; signed: boolean };
    expect(size.bytes).toBe(Object.values(index.objects).reduce((sum, o) => sum + o.bytes, 0));
    expect(size.objects).toBe(Object.keys(index.objects).length);
    expect(size.parts).toEqual([expect.objectContaining({ file: '5736-01-tishrei-src.skpack' })]);
    expect(size.signed).toBe(true);
  });

  it('streams a signed pack whose every object hashes to its name, with an exact Content-Length', async () => {
    const { store, index, meta } = publish();
    const handler = createHandler(store, { signingKey: key });
    const response = await get(handler, '/v1/build?scope=5736-01&sections=everything');
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Number(response.headers.get('Content-Length'))).toBe(bytes.length);
    expect(response.headers.get('Content-Disposition')).toContain('5736-01-tishrei-src.skpack');

    const entries = readZip(bytes);
    expect(entries[0]!.name).toBe('manifest.json');
    const manifest = parsePackManifest(JSON.parse(new TextDecoder().decode(entries[0]!.data))) as PackManifest;
    expect(verifyManifest(manifest, { [key.keyId]: key.publicKey })).toEqual({ ok: true, keyId: key.keyId });
    expect(manifest.objectsIndex).toEqual({ version: '1.1.0', sha256: meta.objectsIndex.sha256 });
    expect(entries[1]!.name).toBe('objects.json');
    expect(sha256(entries[1]!.data)).toBe(meta.objectsIndex.sha256);
    const objects = entries.slice(2);
    expect(objects.map((e) => e.name.slice('objects/'.length)).sort()).toEqual(Object.keys(manifest.objects).sort());
    for (const entry of [...entries]) expect(crc32(entry.data)).toBe(entry.crc);
    for (const entry of objects) expect(sha256(entry.data)).toBe(entry.name.slice('objects/'.length));
    expect(Object.keys(manifest.objects).length).toBe(Object.keys(index.objects).length);
    // The same URL gives the same bytes: a CDN may cache it.
    const again = new Uint8Array(await (await get(handler, '/v1/build?scope=5736-01&sections=everything')).arrayBuffer());
    expect(Buffer.from(again).equals(Buffer.from(bytes))).toBe(true);
  });

  it('splits by whole occasions and serves each part', async () => {
    const { store } = publish();
    const handler = createHandler(store, { signingKey: key });
    const size = (await (await get(handler, '/v1/size?scope=5736-01&sections=everything&maxMb=0.02')).json()) as { parts: Array<{ file: string }> };
    expect(size.parts.length).toBeGreaterThan(1);
    const last = size.parts.length;
    const response = await get(handler, `/v1/build?scope=5736-01&sections=everything&maxMb=0.02&part=${last}`);
    expect(response.headers.get('Content-Disposition')).toContain(`part${last}of${last}`);
    const manifest = JSON.parse(new TextDecoder().decode(readZip(new Uint8Array(await response.arrayBuffer()))[0]!.data)) as PackManifest;
    expect(manifest.part).toEqual(expect.objectContaining({ index: last - 1, count: last }));
    expect((await get(handler, `/v1/build?scope=5736-01&sections=everything&maxMb=0.02&part=${last + 1}`)).status).toBe(400);
  });

  it('says what is wrong with a request', async () => {
    const { store } = publish();
    const handler = createHandler(store, { signingKey: key });
    expect((await get(handler, '/v1/build')).status).toBe(400);
    expect((await get(handler, '/v1/build?scope=5736-13')).status).toBe(400);
    expect((await get(handler, '/v1/build?scope=5736&profile=flac')).status).toBe(400);
    expect((await get(handler, '/v1/size?scope=5750')).status).toBe(404);
    expect((await get(handler, '/v1/packs/..%2Fmeta.json')).status).toBe(404);
    expect((await get(handler, '/v1/nothing')).status).toBe(404);
    const empty = createHandler(memoryStore(new Map()), { signingKey: key });
    expect((await get(empty, '/v1/meta')).status).toBe(503);
  });

  it('fails a pack whose object arrives short, rather than send a broken one', async () => {
    const { store } = publish({ truncate: true });
    const handler = createHandler(store, { signingKey: key });
    const response = await get(handler, '/v1/build?scope=5736-01&sections=everything');
    await expect(response.arrayBuffer()).rejects.toThrow();
  });

  it('serves the published files and allows the download site', async () => {
    const { store, files } = publish();
    files.set(publishKeys.pack('5736-src.skpack'), new Uint8Array([1, 2, 3]));
    const handler = createHandler(store, { signingKey: null, corsOrigin: 'https://download.test' });
    const pack = await get(handler, '/v1/packs/5736-src.skpack');
    expect(pack.headers.get('Access-Control-Allow-Origin')).toBe('https://download.test');
    expect(new Uint8Array(await pack.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect((await get(handler, '/v1/catalog/5736')).status).toBe(200);
    const unsigned = await get(handler, '/v1/build?scope=5736-01');
    expect(unsigned.headers.get('X-SK-Signed')).toBe('unsigned');
  });
});
