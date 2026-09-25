import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { ArchiveStore } from '@sichos-kodesh/archive';
import type { CatalogEntry, LibraryCollection, LibraryItemBase } from '@sichos-kodesh/catalog';
import { generateKeyPair } from '@sichos-kodesh/pack-format';
import { parsePublishMeta } from '@sichos-kodesh/pack-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPacks } from '../src/build.js';
import { indexPacks } from '../src/packIndex.js';
import { publishArchive } from '../src/publish.js';
import { parseScope, parseSections } from '../src/scope.js';
import { servePublished } from '../src/serve.js';
import { verifyPack } from '../src/verify.js';

// Invented bytes and ids: nothing here is a real recording or hanacha.
const FILES: Record<string, Buffer> = {
  'JEMSK0001A.mp3': Buffer.alloc(30_000, 1),
  'JEMSK0002A.mp3': Buffer.alloc(25_000, 3),
  DRIVE_SK_0000000000000000000: Buffer.from('%PDF-1.4 sichos kodesh hanacha'),
  DRIVE_MUGAH_000000000000000000: Buffer.from('%PDF-1.4 mugah'),
};
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const ENTRIES: CatalogEntry[] = [
  {
    occasionId: 101,
    hebrewYear: 5736,
    hebrewDate: '5736-01-06',
    occasionLabel: 'ו\' תשרי',
    audio: [{ workerFilename: 'JEMSK0001A.mp3', durationMs: 1000 }],
    pdfs: [
      { section: 'biltiMugah', label: 'שיחו"ק', driveFileId: 'DRIVE_SK_0000000000000000000' },
      { section: 'mugah', label: 'לקו"ש', driveFileId: 'DRIVE_MUGAH_000000000000000000' },
    ],
  },
  {
    occasionId: 102,
    hebrewYear: 5736,
    hebrewDate: '5736-02-13',
    occasionLabel: 'י"ג חשון',
    audio: [{ workerFilename: 'JEMSK0002A.mp3', durationMs: 800 }],
    pdfs: [],
  },
];

// A maamar whose PDF is one of the farbrengen's: the library shares the object.
const MAAMORIM: LibraryCollection<LibraryItemBase> = {
  items: [
    { id: '7', label: 'באתי לגני', hebrewYear: 5736, refs: [{ kind: 'pdf', sourceId: 'DRIVE_MUGAH_000000000000000000', role: 'mugah' }] },
    { id: '8', label: 'לא בארכיון', hebrewYear: 5736, refs: [{ kind: 'pdf', sourceId: 'DRIVE_NOT_ARCHIVED_0000000000' }] },
  ],
  groups: { year: [{ slug: '5736', name: 'תשל"ו', itemIds: ['7', '8'] }] },
};

let dir: string;
let store: ArchiveStore;
let server: Server;
let base: string;
const key = generateKeyPair(new Uint8Array(32).fill(4));

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sk-publish-'));
  store = await ArchiveStore.open(path.join(dir, 'archive'));
  const commit = store.beginCommit('test', 'fixture objects');
  const insertRef = store.db.prepare('INSERT INTO refs (collection, item_id, sha256, kind, source_id, role, commit_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const [sourceId, bytes] of Object.entries(FILES)) {
    const tmp = store.tmpPath();
    await writeFile(tmp, bytes);
    const kind = sourceId.endsWith('.mp3') ? 'audio' : 'pdf';
    await store.putObject(tmp, sha(bytes), bytes.length, kind, kind === 'audio' ? 'src' : null, null, commit);
    insertRef.run('farbrengens', sourceId.startsWith('JEMSK0002') ? '102' : '101', sha(bytes), kind, sourceId, '', commit);
  }
  // A prebuilt pack beside the custom builds.
  const scope = parseScope('5736');
  await buildPacks(store, {
    entries: ENTRIES,
    contentTypes: parseSections('everything'),
    profile: 'src',
    scope: scope.scope,
    slug: scope.slug,
    outDir: path.join(dir, 'packs'),
    maxBytes: 200 * 1024 * 1024,
    key,
    catalogVersion: '1.1.0',
    embedObjectsIndex: true,
    allowMissing: false,
  });
  const { index } = await indexPacks(path.join(dir, 'packs'), () => new Date('2026-09-24T00:00:00Z'));
  await writeFile(path.join(dir, 'packs', 'index.json'), JSON.stringify(index));
  await publishArchive(store, {
    years: new Map([[5736, ENTRIES]]),
    library: { maamorim: MAAMORIM, reshimos: { items: [], groups: {} } },
    catalogVersion: '1.1.0',
    outDir: path.join(dir, 'published'),
    packsDir: path.join(dir, 'packs'),
    now: () => new Date('2026-09-24T08:00:00Z'),
  });
  server = await servePublished(path.join(dir, 'published'), { port: 0, signingKey: key });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  store.close();
  await rm(dir, { recursive: true, force: true });
});

describe('sk-pack publish and serve', () => {
  it('publishes what the archive holds, by year, with its CRCs', async () => {
    const meta = parsePublishMeta(JSON.parse(await readFile(path.join(dir, 'published', 'meta.json'), 'utf8')));
    // A collection with nothing archived (reshimos here) is not published.
    expect(meta).toMatchObject({ years: [5736], profiles: ['src'], objects: 4, catalogVersion: '1.1.0', library: ['maamorim'] });
    for (const bytes of Object.values(FILES)) expect((await stat(path.join(dir, 'published', 'objects', sha(bytes)))).size).toBe(bytes.length);
    // A second publish finds everything in place.
    const again = await publishArchive(store, { years: new Map([[5736, ENTRIES]]), library: { maamorim: MAAMORIM }, catalogVersion: '1.1.0', outDir: path.join(dir, 'published') });
    expect(again).toMatchObject({ linked: 0, copied: 0, skipped: 4 });
  });

  it('streams a custom month that sk-pack verify accepts, signed', async () => {
    const response = await fetch(`${base}/v1/build?scope=5736-01&sections=everything`);
    expect(response.status).toBe(200);
    const file = path.join(dir, 'custom.skpack');
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    const check = await verifyPack(file, { [key.keyId]: key.publicKey });
    expect(check.problems).toEqual([]);
    expect(check.ok).toBe(true);
    expect(check.manifest!.entries.map((entry) => entry.itemId)).toEqual(['101']);
  });

  it('sizes and streams a library group, signed, with the items the archive holds', async () => {
    const collection = (await (await fetch(`${base}/v1/library/maamorim`)).json()) as LibraryCollection<LibraryItemBase>;
    expect(collection.groups.year![0]!.itemIds).toEqual(['7', '8']);
    expect((await fetch(`${base}/v1/library/jemEvents`)).status).toBe(404);
    const size = (await (await fetch(`${base}/v1/size?scope=maamorim:year:5736`)).json()) as { occasions: number; objects: number; missing: number; slug: string; scope: { kind: string; label: { he: string } } };
    expect(size).toMatchObject({ occasions: 1, objects: 1, missing: 1, slug: 'maamorim-year-5736', scope: { kind: 'year', label: { he: 'מאמרים, תשל"ו' } } });
    expect((await fetch(`${base}/v1/size?scope=maamorim:year:5799`)).status).toBe(404);
    expect((await fetch(`${base}/v1/size?scope=reshimos`)).status).toBe(404);
    const response = await fetch(`${base}/v1/build?scope=maamorim:year:5736`);
    expect(response.headers.get('content-disposition')).toContain('maamorim-year-5736-src.skpack');
    const file = path.join(dir, 'maamorim.skpack');
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    const check = await verifyPack(file, { [key.keyId]: key.publicKey });
    expect(check.problems).toEqual([]);
    expect(check.manifest!.entries).toEqual([
      expect.objectContaining({ collection: 'maamorim', itemId: '7', refs: [expect.objectContaining({ kind: 'pdf', role: 'mugah', sha256: sha(FILES.DRIVE_MUGAH_000000000000000000!) })] }),
    ]);
  });

  it('serves the prebuilt packs and their index', async () => {
    const index = (await (await fetch(`${base}/v1/packs/index.json`)).json()) as { packs: Array<{ file: string; bytes: number }> };
    expect(index.packs).toHaveLength(1);
    const pack = await fetch(`${base}/v1/packs/${index.packs[0]!.file}`);
    expect(Number(pack.headers.get('content-length'))).toBe(index.packs[0]!.bytes);
    expect((await fetch(`${base}/v1/packs/..%2F..%2Fmeta.json`)).status).toBe(404);
  });
});
