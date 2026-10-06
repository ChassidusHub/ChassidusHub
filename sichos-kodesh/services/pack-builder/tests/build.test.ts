import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArchiveStore, exportObjectsIndex } from '@sichos-kodesh/archive';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { PackKeyPair, TrustedKeys } from '@sichos-kodesh/pack-format';
import { generateKeyPair, parsePackIndexFile } from '@sichos-kodesh/pack-format';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPacks, splitEntries, type BuildOptions } from '../src/build.js';
import { createKeyFile, readKeyFile } from '../src/keys.js';
import { indexPacks } from '../src/packIndex.js';
import { parseScope, parseSections } from '../src/scope.js';
import { encoderArgs, isNigun, transcode, type Encode } from '../src/transcode.js';
import { readZipDirectory } from '../src/zip.js';
import { verifyPack } from '../src/verify.js';

// Invented bytes and ids: nothing here is a real recording or hanacha.
const FILES = {
  'JEMSK0001A.mp3': Buffer.alloc(3000, 1),
  'JEMSK0001B.mp3': Buffer.alloc(2000, 2),
  'JEMSK0002A.mp3': Buffer.alloc(2500, 3),
  DRIVE_SK: Buffer.from('%PDF-1.4 sichos kodesh hanacha'),
  DRIVE_MUGAH: Buffer.from('%PDF-1.4 mugah'),
  DRIVE_HAGAHOS: Buffer.from('%PDF-1.4 hagahos'),
};
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

const ENTRIES: CatalogEntry[] = [
  {
    occasionId: 101,
    hebrewYear: 5736,
    hebrewDate: '5736-01-06',
    occasionLabel: 'ו\' תשרי',
    audio: [
      { workerFilename: 'JEMSK0001A.mp3', durationMs: 1000, chapterName: 'Sicha 1' },
      { workerFilename: 'JEMSK0001B.mp3', durationMs: 900, chapterName: 'Sicha 2' },
    ],
    pdfs: [
      { section: 'biltiMugah', label: 'שיחו"ק', driveFileId: 'DRIVE_SK' },
      { section: 'mugah', label: 'לקו"ש', driveFileId: 'DRIVE_MUGAH' },
      { section: 'hagahos', label: 'הגהות', driveFileId: 'DRIVE_HAGAHOS' },
    ],
  },
  {
    occasionId: 102,
    hebrewYear: 5736,
    hebrewDate: '5736-01-13',
    occasionLabel: 'מוצאי י"ג תשרי',
    audio: [{ workerFilename: 'JEMSK0002A.mp3', durationMs: 800, chapterName: 'Sicha 1' }],
    pdfs: [{ section: 'biltiMugah', label: 'שיחו"ק', driveFileId: 'DRIVE_SK' }],
  },
];

let dir: string;
let store: ArchiveStore;
let key: PackKeyPair;
let trusted: TrustedKeys;

async function archive(): Promise<void> {
  const commit = store.beginCommit('test', 'fixture objects');
  const insertRef = store.db.prepare('INSERT INTO refs (collection, item_id, sha256, kind, source_id, role, commit_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertWanted = store.db.prepare(
    "INSERT INTO wanted (collection, item_id, kind, source_id, role, source, url, hebrew_year, hebrew_date, seen_at) VALUES ('farbrengens', ?, ?, ?, '', ?, ?, 5736, ?, 'now')",
  );
  for (const [sourceId, bytes] of Object.entries(FILES)) {
    const tmp = store.tmpPath();
    await writeFile(tmp, bytes);
    const kind = sourceId.endsWith('.mp3') ? 'audio' : 'pdf';
    await store.putObject(tmp, sha(bytes), bytes.length, kind, kind === 'audio' ? 'src' : null, null, commit);
    const item = sourceId.startsWith('JEMSK0002') ? '102' : '101';
    insertRef.run('farbrengens', item, sha(bytes), kind, sourceId, '', commit);
    insertWanted.run(item, kind, sourceId, kind === 'audio' ? 'jem' : 'drive', `https://upstream/${sourceId}`, item === '101' ? '5736-01-06' : '5736-01-13');
  }
}

const options = (overrides: Partial<BuildOptions> = {}): BuildOptions => {
  const scope = parseScope('5736-01');
  return {
    entries: ENTRIES,
    contentTypes: parseSections('essentials'),
    profile: 'src',
    scope: scope.scope,
    slug: scope.slug,
    outDir: path.join(dir, 'packs'),
    maxBytes: 200 * 1024 * 1024,
    key,
    catalogVersion: '1.0.0',
    embedObjectsIndex: true,
    allowMissing: false,
    now: () => new Date('2026-09-24T00:00:00.000Z'),
    ...overrides,
  };
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sk-pack-'));
  store = await ArchiveStore.open(path.join(dir, 'archive'));
  key = generateKeyPair(new Uint8Array(32).fill(9));
  trusted = { [key.keyId]: key.publicKey };
  await archive();
});

afterAll(async () => {
  store.close();
  await rm(dir, { recursive: true, force: true });
});

describe('buildPacks', () => {
  it('packs the selection into one signed, stored pack that verifies', async () => {
    const result = await buildPacks(store, options());
    expect(result.packs).toHaveLength(1);
    const [pack] = result.packs;
    expect(path.basename(pack!.file)).toBe('5736-01-tishrei-src.skpack');
    // essentials: the recordings and the sichos kodesh hanacha, not mugah or hagahos
    expect(pack!.manifest.entries.map((e) => [e.itemId, e.refs.map((r) => r.sourceId)])).toEqual([
      ['101', ['JEMSK0001A.mp3', 'JEMSK0001B.mp3', 'DRIVE_SK']],
      ['102', ['JEMSK0002A.mp3', 'DRIVE_SK']],
    ]);
    expect(Object.keys(pack!.manifest.objects)).toHaveLength(4);
    expect(pack!.manifest.entries[0]!.refs[0]).toMatchObject({ kind: 'audio', profile: 'src', role: '0', durationMs: 1000, label: 'Sicha 1' });
    expect(pack!.manifest.signature?.keyId).toBe(key.keyId);

    const entries = await readZipDirectory(pack!.file);
    expect(entries.map((e) => e.name).slice(0, 2)).toEqual(['manifest.json', 'objects.json']);
    expect(entries.every((e) => e.method === 0)).toBe(true);

    const check = await verifyPack(pack!.file, trusted);
    expect(check.problems).toEqual([]);
    expect(check).toMatchObject({ ok: true, objects: 4, objectBytes: 3000 + 2000 + 2500 + FILES.DRIVE_SK.length });
  });

  it('builds the same pack id for the same selection', async () => {
    const a = await buildPacks(store, options({ outDir: path.join(dir, 'a') }));
    const b = await buildPacks(store, options({ outDir: path.join(dir, 'b'), now: () => new Date('2027-01-01T00:00:00.000Z') }));
    expect(a.packs[0]!.manifest.packId).toBe(b.packs[0]!.manifest.packId);
  });

  it('splits by whole occasions, and every part verifies on its own', async () => {
    const result = await buildPacks(store, options({ outDir: path.join(dir, 'split'), maxBytes: 6000 }));
    expect(result.packs.map((p) => path.basename(p.file))).toEqual(['5736-01-tishrei-src.part1of2.skpack', '5736-01-tishrei-src.part2of2.skpack']);
    const [one, two] = result.packs.map((p) => p.manifest);
    expect(one!.part).toEqual({ index: 0, count: 2, setId: expect.any(String) });
    expect(two!.part?.setId).toBe(one!.part?.setId);
    // the hanacha both occasions share travels with each part that needs it
    expect(Object.keys(two!.objects)).toContain(sha(FILES.DRIVE_SK));
    for (const pack of result.packs) expect((await verifyPack(pack.file, trusted)).ok).toBe(true);
  });

  it('refuses a selection the archive does not fully hold, unless told to build without the rest', async () => {
    const withMissing: CatalogEntry[] = [{ ...ENTRIES[0]!, pdfs: [...ENTRIES[0]!.pdfs, { section: 'mugah', label: 'x', driveFileId: 'NOT_ARCHIVED' }] }];
    const everything = parseSections('everything');
    await expect(buildPacks(store, options({ entries: withMissing, contentTypes: everything, outDir: path.join(dir, 'm') }))).rejects.toThrow('1 file(s) of the selection are not in the archive');
    const lines: string[] = [];
    const result = await buildPacks(store, options({ entries: withMissing, contentTypes: everything, outDir: path.join(dir, 'm'), allowMissing: true, log: (l) => lines.push(l) }));
    expect(result.missing.map((t) => t.driveFileId)).toEqual(['NOT_ARCHIVED']);
    expect(lines[0]).toContain('warning: 1 file(s)');
    expect(Object.keys(result.packs[0]!.manifest.objects)).toHaveLength(5);
  });

  it('carries a catalog release when asked, stamped in the manifest', async () => {
    const release = path.join(dir, 'catalog.json');
    await writeFile(release, JSON.stringify({ schemaVersion: 1, version: '1.0.1', releasedAt: '2026-09-24', byYear: {} }));
    const result = await buildPacks(store, options({ outDir: path.join(dir, 'c'), catalogRelease: { file: release, version: '1.0.1' } }));
    expect(result.packs[0]!.manifest.catalog?.version).toBe('1.0.1');
    expect((await verifyPack(result.packs[0]!.file, trusted)).ok).toBe(true);
  });

  it('stops when an object is known but its bytes are gone', async () => {
    const lost = store.objectPath(sha(FILES.DRIVE_HAGAHOS));
    const bytes = await readFile(lost);
    await unlink(lost);
    try {
      await expect(buildPacks(store, options({ contentTypes: parseSections('hagahos'), outDir: path.join(dir, 'lost') }))).rejects.toThrow('its bytes are missing from the archive');
    } finally {
      await writeFile(lost, bytes);
    }
  });
});

describe('verifyPack', () => {
  it('names an unsigned pack, an unknown key, and a flipped byte', async () => {
    const unsigned = (await buildPacks(store, options({ outDir: path.join(dir, 'u'), key: null }))).packs[0]!;
    expect((await verifyPack(unsigned.file, trusted)).problems).toEqual(['signature: unsigned']);
    const signed = (await buildPacks(store, options({ outDir: path.join(dir, 't') }))).packs[0]!;
    expect((await verifyPack(signed.file, {})).problems).toEqual(['signature: unknown-key']);

    const entries = await readZipDirectory(signed.file);
    const object = entries.find((e) => e.name.startsWith('objects/'))!;
    const handle = await open(signed.file, 'r+');
    await handle.write(Buffer.from([0xff]), 0, 1, object.dataOffset + 10);
    await handle.close();
    const check = await verifyPack(signed.file, trusted);
    expect(check.ok).toBe(false);
    expect(check.problems.some((p) => p.includes('hashes to'))).toBe(true);
    expect(check.problems.some((p) => p.includes("fails the ZIP's CRC-32"))).toBe(true);
  });
});

describe('indexPacks', () => {
  it('lists every pack with its hash and objects, and skips what is not a pack', async () => {
    const out = path.join(dir, 'indexed');
    await buildPacks(store, options({ outDir: out, maxBytes: 6000 }));
    await writeFile(path.join(out, 'junk.skpack'), 'not a zip');
    const { index, skipped } = await indexPacks(out, () => new Date('2026-09-24T00:00:00.000Z'));
    expect(index.packs.map((p) => p.file)).toEqual(['5736-01-tishrei-src.part1of2.skpack', '5736-01-tishrei-src.part2of2.skpack']);
    expect(skipped).toEqual([expect.stringContaining('junk.skpack')]);
    const first = index.packs[0]!;
    expect(first.bytes).toBe((await stat(path.join(out, first.file))).size);
    expect(first.sha256).toBe(sha(await readFile(path.join(out, first.file))));
    expect(parsePackIndexFile(JSON.parse(JSON.stringify(index)))).toEqual(index);
  });
});

describe('splitEntries', () => {
  it('gives an occasion larger than the limit a part of its own', () => {
    const ref = (s: string, bytes: number) => ({ sha256: s.repeat(64), bytes, kind: 'pdf' as const, sourceId: s });
    const parts = splitEntries(
      [
        { collection: 'farbrengens', itemId: '1', refs: [ref('a', 10)] },
        { collection: 'farbrengens', itemId: '2', refs: [ref('b', 500)] },
        { collection: 'farbrengens', itemId: '3', refs: [ref('c', 10), ref('a', 10)] },
      ],
      100,
    );
    expect(parts.map((p) => [p.entries.map((e) => e.itemId), p.bytes])).toEqual([
      [['1'], 10],
      [['2'], 500],
      [['3'], 20],
    ]);
  });
});

describe('keys', () => {
  it('writes a private key file once, and reads it back checked', async () => {
    const file = path.join(dir, 'keys', 'pack-signing.json');
    const pair = await createKeyFile(file, { seed: new Uint8Array(32).fill(4) });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readKeyFile(file)).toEqual(pair);
    await expect(createKeyFile(file)).rejects.toThrow('already exists');
    await writeFile(file, JSON.stringify({ ...pair, keyId: '0000000000000000' }));
    await expect(readKeyFile(file)).rejects.toThrow('does not match its public key');
  });
});

describe('transcode', () => {
  // A stand-in for ffmpeg: the "encoding" is the bitrate asked for plus the start of the input.
  const calls: string[][] = [];
  const fakeEncode: Encode = async (args) => {
    calls.push(args);
    const input = await readFile(args[args.indexOf('-i') + 1]!);
    await writeFile(args[args.length - 1]!, Buffer.concat([Buffer.from(`enc ${args[args.indexOf('-b:a') + 1]} `), input.subarray(0, 64)]));
  };

  it('encodes each original once, a nigun one profile up, and packs the encoded profile', async () => {
    store.db.prepare("UPDATE refs SET label = 'A Few Nigunim' WHERE source_id = 'JEMSK0002A.mp3'").run();
    const first = await transcode(store, { profile: 'opus24', encode: fakeEncode, collection: 'farbrengens', scope: '5736-01' });
    expect(first).toMatchObject({ encoded: 3, skipped: 0, failed: 0 });
    const bitrates = calls.map((args) => [args[args.indexOf('-i') + 1]!.split('/').pop()!.slice(0, 8), args[args.indexOf('-b:a') + 1]]);
    expect(bitrates).toContainEqual([sha(FILES['JEMSK0002A.mp3']).slice(0, 8), '32k']);
    expect(bitrates.filter(([, rate]) => rate === '24k')).toHaveLength(2);
    expect(store.db.prepare("SELECT encoder FROM derivations WHERE src_sha256 = ?").get(sha(FILES['JEMSK0002A.mp3']))).toEqual({ encoder: 'libopus 32k vbr mono 60ms (nigun, one profile up)' });

    const again = await transcode(store, { profile: 'opus24', encode: fakeEncode });
    expect(again).toMatchObject({ encoded: 0, skipped: 3 });

    const index = exportObjectsIndex(store, '1.0.0');
    const derived = Object.values(index.objects).filter((o) => o.profile === 'opus24');
    expect(derived.map((o) => o.sourceId).sort()).toEqual(['JEMSK0001A.mp3', 'JEMSK0001B.mp3', 'JEMSK0002A.mp3']);

    const result = await buildPacks(store, options({ profile: 'opus24', outDir: path.join(dir, 'opus') }));
    const pack = result.packs[0]!;
    expect(path.basename(pack.file)).toBe('5736-01-tishrei-opus24.skpack');
    const audio = pack.manifest.entries.flatMap((e) => e.refs).filter((r) => r.kind === 'audio');
    expect(audio.every((r) => r.profile === 'opus24')).toBe(true);
    expect(audio.every((r) => r.bytes < 100)).toBe(true);
    expect((await verifyPack(pack.file, trusted)).ok).toBe(true);
  });

  it('records nothing for an encode that fails', async () => {
    const failing: Encode = async () => {
      throw new Error('ffmpeg exited 1: no such codec');
    };
    const lines: string[] = [];
    const result = await transcode(store, { profile: 'opus16', encode: failing, log: (l) => lines.push(l) });
    expect(result).toMatchObject({ encoded: 0, failed: 3 });
    expect(lines[0]).toContain('no such codec');
    expect(store.db.prepare("SELECT count(*) AS n FROM derivations WHERE profile = 'opus16'").get()).toEqual({ n: 0 });
  });

  it('builds bit-exact ffmpeg arguments', () => {
    const { args, encoder } = encoderArgs('opus24', 'in.mp3', 'out.opus', false);
    expect(args).toEqual(expect.arrayContaining(['-ac', '1', '-c:a', 'libopus', '-b:a', '24k', '-frame_duration', '60', '-fflags', '+bitexact', '-map_metadata', '-1']));
    expect(args.slice(-3)).toEqual(['-f', 'opus', 'out.opus']);
    expect(encoder).toBe('libopus 24k vbr mono 60ms');
    expect(encoderArgs('mp3-32', 'in.mp3', 'out.mp3', true).args).toEqual(expect.arrayContaining(['-c:a', 'libmp3lame', '-b:a', '32k']));
    expect(isNigun(['Sicha 1', null])).toBe(false);
    expect(isNigun(['Ma’amar Nigun'])).toBe(true);
    expect(isNigun(['Niggun'])).toBe(true);
  });
});
