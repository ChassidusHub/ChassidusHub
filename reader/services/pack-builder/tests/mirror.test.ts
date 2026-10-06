import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArchiveStore } from '@chassidushub-reader/archive';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mirrorPublished } from '../src/mirror.js';
import { publishArchive } from '../src/publish.js';

// Invented bytes and ids: nothing here is a real recording or hanacha.
const FILES: Record<string, Buffer> = {
  'JEMSK0001A.mp3': Buffer.alloc(30_000, 1),
  DRIVE_SK_0000000000000000000: Buffer.from('%PDF-1.4 sichos kodesh hanacha'),
};
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const ENTRIES: CatalogEntry[] = [
  {
    occasionId: 101,
    hebrewYear: 5736,
    hebrewDate: '5736-01-06',
    occasionLabel: 'ו\' תשרי',
    audio: [{ workerFilename: 'JEMSK0001A.mp3', durationMs: 1000 }],
    pdfs: [{ section: 'biltiMugah', label: 'שיחו"ק', driveFileId: 'DRIVE_SK_0000000000000000000' }],
  },
];
const API = 'https://r2.test/client/v4';

/** Cloudflare's R2 object API, as far as the mirror uses it: list (paged) and put. */
function fakeR2() {
  const bucket = new Map<string, Buffer>();
  const puts: string[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-token');
    const prefix = '/client/v4/accounts/acct/r2/buckets/archive/objects';
    if (init?.method === 'PUT') {
      const key = decodeURIComponent(url.pathname.slice(prefix.length + 1));
      bucket.set(key, Buffer.from(init.body as Uint8Array));
      puts.push(key);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    // One key per page, to walk the cursor.
    const keys = [...bucket.keys()].sort();
    const start = Number(url.searchParams.get('cursor') ?? 0);
    const page = keys.slice(start, start + 1);
    return Response.json({
      success: true,
      result: page.map((key) => ({ key, size: bucket.get(key)!.length, etag: `"${createHash('md5').update(bucket.get(key)!).digest('hex')}"` })),
      result_info: { is_truncated: start + 1 < keys.length, cursor: String(start + 1) },
    });
  }) as typeof fetch;
  return { bucket, puts, target: { accountId: 'acct', bucket: 'archive', token: 'test-token', apiBase: API, fetch: fetchFn } };
}

let dir: string;
let store: ArchiveStore;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sk-mirror-'));
  store = await ArchiveStore.open(path.join(dir, 'archive'));
  const commit = store.beginCommit('test', 'fixture objects');
  const insertRef = store.db.prepare('INSERT INTO refs (collection, item_id, sha256, kind, source_id, role, commit_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const [sourceId, bytes] of Object.entries(FILES)) {
    const tmp = store.tmpPath();
    await writeFile(tmp, bytes);
    const kind = sourceId.endsWith('.mp3') ? 'audio' : 'pdf';
    await store.putObject(tmp, sha(bytes), bytes.length, kind, kind === 'audio' ? 'src' : null, null, commit);
    insertRef.run('farbrengens', '101', sha(bytes), kind, sourceId, '', commit);
  }
});

afterAll(async () => {
  store.close();
  await rm(dir, { recursive: true, force: true });
});

const exists = (file: string) => stat(file).then(() => true, () => false);

describe('sk-pack mirror', () => {
  it('sends objects first and meta.json last, prunes, and publish carries on without the bytes', async () => {
    const out = path.join(dir, 'published');
    const publish = () => publishArchive(store, { years: new Map([[5736, ENTRIES]]), catalogVersion: '1.1.0', outDir: out, now: () => new Date('2026-09-24T08:00:00Z') });
    const first = await publish();
    const r2 = fakeR2();

    const sent = await mirrorPublished({ dir: out, target: r2.target, prune: { store } });
    expect(sent).toMatchObject({ uploaded: 6, unchanged: 0, pruned: 2 });
    expect(r2.puts.slice(0, 2).every((key) => key.startsWith('objects/'))).toBe(true);
    expect(r2.puts.at(-1)).toBe('meta.json');
    expect(r2.puts).not.toContain('.crc-cache.json');
    for (const bytes of Object.values(FILES)) {
      expect(r2.bucket.get(`objects/${sha(bytes)}`)).toEqual(bytes);
      expect(await exists(path.join(out, 'objects', sha(bytes)))).toBe(false);
      expect(await exists(store.objectPath(sha(bytes)))).toBe(false);
    }
    expect(JSON.parse(await readFile(path.join(out, '.mirrored.json'), 'utf8'))).toEqual(Object.values(FILES).map(sha).sort());

    // The bytes are gone from this disk, yet the next publish lists the same objects.
    const again = await publish();
    expect(again).toMatchObject({ mirrored: 2, linked: 0, copied: 0 });
    expect({ ...again.meta, objectsIndex: null }).toEqual({ ...first.meta, objectsIndex: null });

    // Only the files stamped with the index's build time are new: the year shard, objects.json, and the meta.json naming it.
    r2.puts.length = 0;
    expect(await mirrorPublished({ dir: out, target: r2.target, prune: { store } })).toMatchObject({ uploaded: 3, unchanged: 1 });
    expect(r2.puts).toEqual(['index/5736.json', 'objects.json', 'meta.json']);
  });

  it('never deletes an object the list does not name yet, even when the run breaks off', async () => {
    const own = await ArchiveStore.open(path.join(dir, 'archive-interrupted'));
    const commit = own.beginCommit('test', 'fixture objects');
    const insertRef = own.db.prepare('INSERT INTO refs (collection, item_id, sha256, kind, source_id, role, commit_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const [sourceId, bytes] of Object.entries(FILES)) {
      const tmp = own.tmpPath();
      await writeFile(tmp, bytes);
      const kind = sourceId.endsWith('.mp3') ? 'audio' : 'pdf';
      await own.putObject(tmp, sha(bytes), bytes.length, kind, kind === 'audio' ? 'src' : null, null, commit);
      insertRef.run('farbrengens', '101', sha(bytes), kind, sourceId, '', commit);
    }
    const out = path.join(dir, 'published-interrupted');
    await publishArchive(own, { years: new Map([[5736, ENTRIES]]), catalogVersion: '1.1.0', outDir: out });
    // The first object goes up, the second upload fails: the run stops half way.
    const r2 = fakeR2();
    const failing = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PUT' && r2.puts.length >= 1) return new Response('refused', { status: 403 });
      return r2.target.fetch(input, init);
    }) as typeof fetch;
    await expect(mirrorPublished({ dir: out, target: { ...r2.target, fetch: failing }, prune: { store: own }, concurrency: 1 })).rejects.toThrow();
    const listed = new Set<string>(await readFile(path.join(out, '.mirrored.json'), 'utf8').then((text) => JSON.parse(text) as string[], () => []));
    for (const bytes of Object.values(FILES)) {
      const onDisk = await exists(own.objectPath(sha(bytes)));
      expect(onDisk || listed.has(sha(bytes))).toBe(true);
    }
    own.close();
  });

  it('refuses to publish an object whose bytes are gone and that was never mirrored', async () => {
    const out = path.join(dir, 'published-2');
    await publishArchive(store, { years: new Map([[5736, ENTRIES]]), catalogVersion: '1.1.0', outDir: out }).then(
      () => expect.unreachable('publish should fail'),
      (error: Error) => expect(error.message).toMatch(/ENOENT|no such file/),
    );
  });
});
