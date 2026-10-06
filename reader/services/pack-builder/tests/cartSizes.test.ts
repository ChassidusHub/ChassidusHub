import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArchiveStore, importText } from '@chassidushub-reader/archive';
import type { CatalogEntry, CatalogWork, CatalogWorkContents, CatalogWorksIndex, LibraryCollection, LibraryItemBase } from '@chassidushub-reader/catalog';
import type { PackableLibraryCollection } from '@chassidushub-reader/pack-format';
import { generateKeyPair, workTextSourceId } from '@chassidushub-reader/pack-format';
import { parseBuildRequest, parsePublishMeta, planBuild } from '@chassidushub-reader/pack-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publishArchive } from '../src/publish.js';
import { directoryStore, servePublished } from '../src/serve.js';
import { verifyPack } from '../src/verify.js';
import { buildWorkPack } from '../src/workPack.js';

/**
 * The download site's cart, every way it can be filled: all 43 years of
 * farbrengens with each library collection, and the whole cart at once
 * (the years, a kvius month, the six collections and the seforim). Every
 * total must come back - pack.sk once lost the total of such a cart when
 * a size request held every year's shard at once and the Worker ran out
 * of memory - and a size request must keep none of the shards' CRC-32s.
 */

// Invented bytes, recordings and texts: nothing here is a real file.
const YEARS = Array.from({ length: 43 }, (_, i) => 5710 + i);
const LIBRARY: PackableLibraryCollection[] = ['likkuteiSichos', 'maamorim', 'yomanim', 'michtavimKlolim', 'hadranim', 'reshimos'];
const TEXT = '<article dir="rtl" lang="he"><h1>פרק א׳</h1><p>וְהַבֵּינוֹנִי</p></article>\n';
const SHARED_PDF = 'DRIVE_SHARED_000000000000000';
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

const FILES = new Map<string, Buffer>();
const audioOf = (year: number) => `JEMSK${year}A.mp3`;
const pdfOf = (year: number) => `DRIVE_${year}_0000000000000000000`;
for (const year of YEARS) {
  FILES.set(audioOf(year), Buffer.alloc(20_000 + (year - 5710) * 10, year % 256));
  FILES.set(pdfOf(year), Buffer.from(`%PDF-1.4 hanacha ${year}`.padEnd(1_000 + (year - 5710), '.')));
}
FILES.set(SHARED_PDF, Buffer.from('%PDF-1.4 shared by a farbrengen and a maamar'.padEnd(3_000, '.')));
const libraryPdf = (collection: string, n: number) => `LIB_${collection}_${n}`.padEnd(28, '0');
for (const collection of LIBRARY) for (const n of [1, 2]) FILES.set(libraryPdf(collection, n), Buffer.from(`%PDF-1.4 ${collection} ${n}`.padEnd(2_000 + n * 100, '.')));

const CATALOG = new Map<number, CatalogEntry[]>(
  YEARS.map((year) => [
    year,
    [
      { occasionId: year * 10 + 1, hebrewYear: year, hebrewDate: `${year}-01-10`, occasionLabel: 'Tishrei', audio: [{ workerFilename: audioOf(year), durationMs: 1000 }], pdfs: [] },
      {
        occasionId: year * 10 + 2,
        hebrewYear: year,
        hebrewDate: `${year}-02-13`,
        occasionLabel: 'Cheshvan',
        audio: [],
        pdfs: [{ section: 'biltiMugah', label: 'שיחו"ק', driveFileId: pdfOf(year) }, ...(year === 5736 ? [{ section: 'mugah' as const, label: 'לקו"ש', driveFileId: SHARED_PDF }] : [])],
      },
    ],
  ]),
);

const collectionOf = (collection: PackableLibraryCollection): LibraryCollection<LibraryItemBase> => ({
  items: [1, 2].map((n) => ({
    id: String(n),
    label: `${collection} ${n}`,
    hebrewYear: 5736,
    refs: [{ kind: 'pdf', sourceId: libraryPdf(collection, n) }, ...(collection === 'maamorim' && n === 1 ? [{ kind: 'pdf' as const, sourceId: SHARED_PDF, role: 'mugah' }] : [])],
  })),
  groups: { year: [{ slug: '5736', name: 'תשל"ו', itemIds: ['1', '2'] }] },
});

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
let archive: ArchiveStore;
let server: Server;
let base: string;
const key = generateKeyPair(new Uint8Array(32).fill(5));

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sk-cart-'));
  archive = await ArchiveStore.open(path.join(dir, 'archive'));
  const commit = archive.beginCommit('test', 'fixture objects');
  const insertRef = archive.db.prepare('INSERT INTO refs (collection, item_id, sha256, kind, source_id, role, commit_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const [sourceId, bytes] of FILES) {
    const tmp = archive.tmpPath();
    await writeFile(tmp, bytes);
    const kind = sourceId.endsWith('.mp3') ? 'audio' : 'pdf';
    await archive.putObject(tmp, sha(bytes), bytes.length, kind, kind === 'audio' ? 'src' : null, null, commit);
    insertRef.run('farbrengens', '1', sha(bytes), kind, sourceId, '', commit);
  }
  await importText(archive, [{ collection: 'works', itemId: 'tanya/1', sourceId: workTextSourceId('tanya', sha(TEXT)), text: TEXT, mime: 'text/html; charset=utf-8' }], { author: 'test', message: 'test' });
  await buildWorkPack(archive, { work: tanya, contents, catalogVersion: '1.3.0', outDir: path.join(dir, 'packs'), key, maxBytes: 1024 * 1024, allowMissing: false });
  await publishArchive(archive, {
    years: CATALOG,
    library: Object.fromEntries(LIBRARY.map((c) => [c, collectionOf(c)])),
    works: WORKS,
    catalogVersion: '1.1.0',
    outDir: path.join(dir, 'published'),
    packsDir: path.join(dir, 'packs'),
    now: () => new Date('2026-09-26T08:00:00Z'),
  });
  server = await servePublished(path.join(dir, 'published'), { port: 0, signingKey: key });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  archive.close();
  await rm(dir, { recursive: true, force: true });
});

type Size = { error?: string; occasions: number; works: number; objects: number; bytes: number; missing: number; parts: Array<{ index: number; file: string; occasions: number; works: number; bytes: number }> };
// A small part size, so a cart splits into many parts.
const MAX_MB = 0.05;
const size = async (query: string): Promise<{ status: number; body: Size }> => {
  const response = await fetch(`${base}/v1/size?${query}&profile=src&sections=everything&maxMb=${MAX_MB}`);
  return { status: response.status, body: (await response.json()) as Size };
};

const bytesOf = (sourceIds: string[]) => [...new Set(sourceIds)].reduce((sum, id) => sum + FILES.get(id)!.length, 0);
const yearFiles = YEARS.flatMap((year) => [audioOf(year), pdfOf(year)]).concat(SHARED_PDF);
const libraryFiles = (collection: PackableLibraryCollection) => [libraryPdf(collection, 1), libraryPdf(collection, 2), ...(collection === 'maamorim' ? [SHARED_PDF] : [])];
const ALL_YEARS = YEARS.join(',');
// The seforim's objects: the text and its search index.
const worksBytes = async () => {
  const entries = JSON.parse(await readFile(path.join(dir, 'published', 'works', 'tanya.json'), 'utf8')) as Array<{ refs: Array<{ sha256: string; bytes: number }> }>;
  const refs = new Map(entries.flatMap((e) => e.refs).map((r) => [r.sha256, r.bytes]));
  expect([...refs.values()]).toContain(Buffer.byteLength(TEXT));
  return [...refs.values()].reduce((sum, bytes) => sum + bytes, 0);
};

function expectWellSplit(body: Size): void {
  expect(body.parts.length).toBeGreaterThan(1);
  expect(body.parts.map((p) => p.index)).toEqual(body.parts.map((_, i) => i));
  expect(body.parts.reduce((sum, p) => sum + p.occasions, 0)).toBe(body.occasions);
  // A part carries each object it needs, so shared objects may count twice across parts - never less than the total.
  expect(body.parts.reduce((sum, p) => sum + p.bytes, 0)).toBeGreaterThanOrEqual(body.bytes);
  for (const part of body.parts) expect(part.file).toMatch(new RegExp(`\\.part${part.index + 1}of${body.parts.length}\\.skpack$`));
}

describe('the cart total, for every mix the site allows', () => {
  it('totals all 43 years of farbrengens', async () => {
    const { status, body } = await size(`scope=${ALL_YEARS}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ occasions: 86, objects: 87, bytes: bytesOf(yearFiles), missing: 0 });
    expectWellSplit(body);
  });

  for (const collection of LIBRARY) {
    it(`totals all 43 years with ${collection}`, async () => {
      const { status, body } = await size(`scope=${ALL_YEARS},${collection}`);
      expect(status, body.error).toBe(200);
      // The maamar's PDF is also a farbrengen's: counted once.
      expect(body).toMatchObject({ occasions: 88, bytes: bytesOf([...yearFiles, ...libraryFiles(collection)]), missing: 0 });
      expectWellSplit(body);
    });
  }

  it('totals the whole cart: the years, a kvius month, every collection and the seforim', async () => {
    const scope = [ALL_YEARS, '5736-01', ...LIBRARY].join(',');
    const { status, body } = await size(`scope=${scope}&works=more,tanya,all`);
    expect(status, body.error).toBe(200);
    // The kvius month is already in its year: its farbrengen is counted once.
    expect(body).toMatchObject({ occasions: 86 + LIBRARY.length * 2, works: 1, bytes: bytesOf([...yearFiles, ...LIBRARY.flatMap(libraryFiles)]) + (await worksBytes()), missing: 0 });
    expectWellSplit(body);
    expect(body.parts.reduce((sum, p) => sum + p.works, 0)).toBe(1);

    // Its first and last parts build, signed and whole.
    for (const part of [1, body.parts.length]) {
      const response = await fetch(`${base}/v1/build?scope=${scope}&works=more,tanya,all&profile=src&sections=everything&maxMb=${MAX_MB}&part=${part}`);
      expect(response.status).toBe(200);
      const file = path.join(dir, `cart-${part}.skpack`);
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      const check = await verifyPack(file, { [key.keyId]: key.publicKey });
      expect(check.problems).toEqual([]);
      expect(check.ok).toBe(true);
    }
  });

  it('keeps no CRC-32 for a size, and only the selected objects’ for a build', async () => {
    const store = directoryStore(path.join(dir, 'published'));
    const meta = parsePublishMeta(JSON.parse(await readFile(path.join(dir, 'published', 'meta.json'), 'utf8')))!;
    const request = parseBuildRequest(new URL(`https://x/v1/size?scope=${ALL_YEARS},${LIBRARY.join(',')}&profile=src&sections=everything&maxMb=${MAX_MB}`));
    const sized = await planBuild(store, meta, request, 'size');
    expect(sized.crc32).toEqual({});
    const built = await planBuild(store, meta, request, 'build');
    expect(Object.keys(built.crc32).sort()).toEqual([...new Set(built.parts.flatMap((p) => Object.keys(p.objects)))].sort());
    expect(built.objects).toBe(sized.objects);
    expect(built.parts.map((p) => p.bytes)).toEqual(sized.parts.map((p) => p.bytes));
  });
});
