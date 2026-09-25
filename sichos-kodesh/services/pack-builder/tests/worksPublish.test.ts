import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArchiveStore, importText } from '@sichos-kodesh/archive';
import type { CatalogEntry, CatalogWork, CatalogWorkContents, CatalogWorksIndex } from '@sichos-kodesh/catalog';
import { generateKeyPair, workTextSourceId } from '@sichos-kodesh/pack-format';
import { parsePublishMeta } from '@sichos-kodesh/pack-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publishArchive } from '../src/publish.js';
import { servePublished } from '../src/serve.js';
import { verifyPack } from '../src/verify.js';
import { buildWorkPack } from '../src/workPack.js';

// Invented texts, recordings and hanachos: nothing here is a real edition.
const TEXT = '<article dir="rtl" lang="he"><h1>פרק א׳</h1><p>וְהַבֵּינוֹנִי</p></article>\n';
const FILES: Record<string, Buffer> = { 'JEMSK0001A.mp3': Buffer.alloc(30_000, 1), 'JEMSK0002A.mp3': Buffer.alloc(20_000, 2), DRIVE_SK_0000000000000000000: Buffer.from('%PDF-1.4 hanacha') };
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const entry = (year: number, occasionId: number, date: string, audio: string): CatalogEntry => ({ occasionId, hebrewYear: year, hebrewDate: date, occasionLabel: String(occasionId), audio: [{ workerFilename: audio, durationMs: 1000 }], pdfs: [] });
const YEARS = new Map<number, CatalogEntry[]>([
  [5736, [entry(5736, 101, '5736-01-06', 'JEMSK0001A.mp3'), { ...entry(5736, 102, '5736-02-13', 'JEMSK0001A.mp3'), audio: [], pdfs: [{ section: 'biltiMugah', label: 'שיחו"ק', driveFileId: 'DRIVE_SK_0000000000000000000' }] }]],
  [5737, [entry(5737, 201, '5737-01-10', 'JEMSK0002A.mp3')]],
]);
const tanya: CatalogWork = {
  id: 'tanya',
  title: { he: 'תניא', en: 'Tanya' },
  authors: ['alter-rebbe'],
  genre: 'chassidus',
  levels: [],
  sources: [{ source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'he', licence: 'cc-by-nc', rights: 'ship-with-credit', version: 'Kehot' }],
  units: 1,
};
const contents: CatalogWorkContents = { workId: 'tanya', contents: [{ unitId: '1' }], units: [{ id: '1', label: 'פרק א׳', editions: [{ source: 0, sha256: sha(TEXT), bytes: Buffer.byteLength(TEXT) }] }] };
const WORKS = { schema: 3, authors: [{ id: 'alter-rebbe', name: { he: 'אדמו"ר הזקן', en: 'the Alter Rebbe' } }], works: [tanya] } as unknown as CatalogWorksIndex;

let dir: string;
let store: ArchiveStore;
let server: Server;
let base: string;
const key = generateKeyPair(new Uint8Array(32).fill(9));

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sk-works-'));
  store = await ArchiveStore.open(path.join(dir, 'archive'));
  const commit = store.beginCommit('test', 'fixture objects');
  const insertRef = store.db.prepare('INSERT INTO refs (collection, item_id, sha256, kind, source_id, role, commit_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const [sourceId, bytes] of Object.entries(FILES)) {
    const tmp = store.tmpPath();
    await writeFile(tmp, bytes);
    const kind = sourceId.endsWith('.mp3') ? 'audio' : 'pdf';
    await store.putObject(tmp, sha(bytes), bytes.length, kind, kind === 'audio' ? 'src' : null, null, commit);
    insertRef.run('farbrengens', '1', sha(bytes), kind, sourceId, '', commit);
  }
  await importText(store, [{ collection: 'works', itemId: 'tanya/1', sourceId: workTextSourceId('tanya', sha(TEXT)), text: TEXT, mime: 'text/html; charset=utf-8' }], { author: 'test', message: 'test' });
  // The text pack sk-pack build-work makes, among the prebuilt packs.
  await buildWorkPack(store, { work: tanya, contents, catalogVersion: '1.3.0', outDir: path.join(dir, 'packs'), key, maxBytes: 1024 * 1024, allowMissing: false });
  await publishArchive(store, { years: YEARS, works: WORKS, catalogVersion: '1.1.0', outDir: path.join(dir, 'published'), packsDir: path.join(dir, 'packs'), now: () => new Date('2026-09-25T08:00:00Z') });
  server = await servePublished(path.join(dir, 'published'), { port: 0, signingKey: key });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  store.close();
  await rm(dir, { recursive: true, force: true });
});

type Size = { scope: { kind: string; label: { he: string; en: string } }; slug: string; occasions: number; works: number; objects: number; parts: Array<{ occasions: number; works: number }> };
const size = async (query: string) => (await (await fetch(`${base}/v1/size?${query}`)).json()) as Size;

describe('many years and the seforim in one pack', () => {
  it('publishes the seforim from their text packs, bundled by author', async () => {
    const meta = parsePublishMeta(JSON.parse(await readFile(path.join(dir, 'published', 'meta.json'), 'utf8')));
    expect(meta).toMatchObject({ years: [5736, 5737], works: 1 });
    const shelf = (await (await fetch(`${base}/v1/works`)).json()) as { bundles: Array<{ id: string; works: string[] }>; works: Array<{ id: string; texts: number; bundle: string }> };
    // One small author: the "more seforim" bundle holds it.
    expect(shelf.works).toEqual([expect.objectContaining({ id: 'tanya', texts: 1, bundle: 'more' })]);
    expect(shelf.bundles.map((b) => b.works)).toEqual([['tanya']]);
  });

  it('takes the same months of several years', async () => {
    const tishrei = await size('scope=5736-01,5737-01&sections=everything');
    expect(tishrei).toMatchObject({ occasions: 2, works: 0, slug: '5736-5737-tishrei', scope: { kind: 'custom', label: { en: 'Tishrei 5736-5737' } } });
    expect((await size('scope=5736,5737&sections=everything')).occasions).toBe(3);
  });

  it('builds the seforim alone, or added to farbrengens, signed, with every text in', async () => {
    const alone = await size('works=all');
    expect(alone).toMatchObject({ occasions: 0, works: 1, slug: 'seforim-tanya', scope: { kind: 'custom', label: { he: 'כל הספרים' } } });
    const both = await size('scope=5736-01,5737-01&sections=everything&works=more');
    expect(both).toMatchObject({ occasions: 2, works: 1, slug: '5736-5737-tishrei-seforim' });
    expect(both.scope.label.he).toBe('תשרי תשל״ו–תשל״ז + כל הספרים');
    expect(both.parts).toEqual([expect.objectContaining({ occasions: 2, works: 1 })]);

    const response = await fetch(`${base}/v1/build?scope=5736-01,5737-01&sections=everything&works=more`);
    expect(response.headers.get('content-disposition')).toContain('5736-5737-tishrei-seforim-src.skpack');
    const file = path.join(dir, 'both.skpack');
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    const check = await verifyPack(file, { [key.keyId]: key.publicKey });
    expect(check.problems).toEqual([]);
    expect(check.manifest!.entries.map((e) => `${e.collection}:${e.itemId}`)).toEqual(['farbrengens:101', 'farbrengens:201', 'works:tanya', 'works:tanya/1']);
    expect(check.manifest!.objects[sha(TEXT)]).toBe(Buffer.byteLength(TEXT));

    expect((await fetch(`${base}/v1/size?works=zohar`)).status).toBe(404);
    expect((await fetch(`${base}/v1/size`)).status).toBe(400);
  });
});
