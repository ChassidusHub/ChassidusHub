import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseObjectsIndex } from '@sichos-kodesh/pack-format';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crawl } from '../src/crawl.js';
import { loadInventory } from '../src/inventory.js';
import { exportObjectsIndex } from '../src/objectsIndex.js';
import { stats, unresolved } from '../src/report.js';
import { ArchiveStore } from '../src/store.js';
import { verify } from '../src/verify.js';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// Upstream stand-ins: JEM's CloudFront (supports Range + ETag), Drive
// (a small file served directly, a "large" one behind the confirm-token
// interstitial, a private one that only returns a sign-in page, a 404).
const AUDIO_A = Buffer.from('mp3 bytes of JEMSK0001A, long enough to resume'.repeat(20));
const AUDIO_B = Buffer.from('mp3 bytes of AR0020397');
const PDF_SMALL = Buffer.from('%PDF-1.4 small hanacha');
const PDF_LARGE = Buffer.from('%PDF-1.4 large hanacha'.repeat(50));
const DRIVE_SMALL = '1SmallSmallSmallSmallSmallSmall1';
const DRIVE_LARGE = '1LargeLargeLargeLargeLargeLarge1';
const DRIVE_PRIVATE = '0BPrivatePrivatePrivatePrivate';
const DRIVE_MISSING = '1MissingMissingMissingMissing1';

let server: Server;
let base = '';
const requests: string[] = [];
let failFirstAudioA = true;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    requests.push(url.pathname + url.search);
    const serveBytes = (bytes: Buffer, type: string) => {
      res.setHeader('etag', `"${sha(bytes).slice(0, 8)}"`);
      res.setHeader('accept-ranges', 'bytes');
      const range = /^bytes=(\d+)-$/.exec(String(req.headers.range ?? ''));
      if (range) {
        const from = Number(range[1]);
        res.writeHead(206, { 'content-type': type, 'content-length': bytes.length - from, 'content-range': `bytes ${from}-${bytes.length - 1}/${bytes.length}` });
        res.end(bytes.subarray(from));
        return;
      }
      res.writeHead(200, { 'content-type': type, 'content-length': bytes.length });
      res.end(bytes);
    };
    if (url.pathname === '/JEMSK0001A.mp3') {
      if (failFirstAudioA && !req.headers.range) {
        // A cut connection half way: the client must resume with Range.
        failFirstAudioA = false;
        res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': AUDIO_A.length });
        res.write(AUDIO_A.subarray(0, 100), () => res.destroy());
        return;
      }
      return serveBytes(AUDIO_A, 'audio/mpeg');
    }
    if (url.pathname === '/AR0020397.mp3') return serveBytes(AUDIO_B, 'audio/mpeg');
    if (url.pathname === '/uc') {
      const id = url.searchParams.get('id');
      if (id === DRIVE_SMALL) return serveBytes(PDF_SMALL, 'application/pdf');
      if (id === DRIVE_LARGE) {
        if (url.searchParams.get('confirm') === 'tok123') return serveBytes(PDF_LARGE, 'application/pdf');
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html>Google Drive can\'t scan this file for viruses. <a href="/uc?export=download&confirm=tok123&id=x">Download anyway</a></html>');
        return;
      }
      if (id === DRIVE_PRIVATE) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><title>Sign in - Google Accounts</title></html>');
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(500);
    res.end('unexpected');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const rewriteUrl = (url: string) => url.replace('https://dtgj2yu3gmlic.cloudfront.net', base).replace('https://drive.google.com', base);
const crawlOptions = { rewriteUrl, minGapMs: 0, maxAttempts: 3, backoffBaseMs: 10 };

async function fixtureDbs(dir: string): Promise<{ jemDb: string; mafteiachDb: string }> {
  const jemDb = path.join(dir, 'jem.db');
  const jem = new DatabaseSync(jemDb);
  jem.exec(`CREATE TABLE events (id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT, type TEXT, hebrew_year INTEGER, hebrew_month INTEGER, hebrew_day INTEGER);
    CREATE TABLE audio_recordings (event_id INTEGER, ccdb_recording_id INTEGER, name TEXT, duration_ms INTEGER, url TEXT, file_format TEXT);
    INSERT INTO events VALUES (1, NULL, 'Farbrengen, Vov Tishrei, 5736', 'Farbrengen', 5736, 1, 6);
    INSERT INTO events VALUES (2, NULL, 'Minchah, Zayin Nissan, 5748', 'Minchah', 5748, 7, 7);
    INSERT INTO audio_recordings VALUES (1, 10, 'Sicha 1', 1000, 'https://dtgj2yu3gmlic.cloudfront.net/JEMSK0001A.mp3', 'mp3');
    INSERT INTO audio_recordings VALUES (2, 11, 'Sicha', 2000, 'https://dtgj2yu3gmlic.cloudfront.net/AR0020397.mp3', 'mp3');`);
  jem.close();
  const mafteiachDb = path.join(dir, 'mafteiach.db');
  const maf = new DatabaseSync(mafteiachDb);
  maf.exec(`CREATE TABLE occasions (id INTEGER PRIMARY KEY, hebrew_year INTEGER, hebrew_date TEXT, occasion_label TEXT);
    CREATE TABLE links (occasion_id INTEGER, section TEXT, group_label TEXT, label TEXT, url TEXT);
    CREATE TABLE jem_audio (occasion_id INTEGER, ccdb_event_id INTEGER, chapter_index INTEGER, chapter_name TEXT, duration_ms INTEGER, url TEXT, file_format TEXT, resolved_at TEXT);
    INSERT INTO occasions VALUES (500, 5736, '5736-01-06', 'ו תשרי');
    INSERT INTO links VALUES (500, 'biltiMugah', 'הנחה', 'תו"מ', 'https://drive.google.com/file/d/${DRIVE_SMALL}/view?usp=sharing');
    INSERT INTO links VALUES (500, 'mugah', NULL, 'לקו"ש', 'https://drive.google.com/open?id=${DRIVE_LARGE}');
    INSERT INTO links VALUES (500, 'hagahos', NULL, 'הגהות', 'https://drive.google.com/open?id=${DRIVE_PRIVATE}&resourcekey=0-abc');
    INSERT INTO links VALUES (500, 'hosofos', NULL, 'הוספות', 'https://drive.google.com/file/d/${DRIVE_MISSING}/view');
    INSERT INTO links VALUES (500, 'english', NULL, 'SIE', 'https://www.sie.org/x');
    INSERT INTO jem_audio VALUES (500, 1, 0, 'Sicha 1', 1000, 'https://dtgj2yu3gmlic.cloudfront.net/JEMSK0001A.mp3', 'mp3', 'now');`);
  maf.close();
  return { jemDb, mafteiachDb };
}

describe('sk-archive end to end', () => {
  let dir: string;
  let store: ArchiveStore;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'sk-archive-'));
    store = await ArchiveStore.open(path.join(dir, 'root'));
  });
  afterAll(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('builds the inventory from both indexers', async () => {
    const dbs = await fixtureDbs(dir);
    const result = loadInventory(store, dbs);
    expect(result).toMatchObject({ audio: 2, pdfs: 4, farbrengenAudioRefs: 1, skipped: { nonDriveLinks: 1, badDriveUrls: 0 } });
    expect(loadInventory(store, dbs)).toMatchObject({ audio: 2, pdfs: 4 }); // upsert, not duplicate
    expect((store.db.prepare('SELECT count(*) AS n FROM wanted').get() as { n: number }).n).toBe(7);
  });

  it('crawls: resumes a cut download, follows the Drive confirm token, records unresolved files, refs every wanting item', async () => {
    const result = await crawl(store, { ...crawlOptions, concurrency: 2 });
    expect(result.fetched).toBe(4);
    expect(result.unresolved).toBe(2);
    expect(result.errors).toBe(0);
    for (const bytes of [AUDIO_A, AUDIO_B, PDF_SMALL, PDF_LARGE]) {
      expect(store.hasObject(sha(bytes))).toBe(true);
      expect(await readFile(store.objectPath(sha(bytes)))).toEqual(bytes);
    }
    // The cut download resumed with a Range request instead of starting over.
    expect(requests.some((r) => r === '/JEMSK0001A.mp3')).toBe(true);
    const audioARow = store.db.prepare("SELECT status, http_status FROM sources WHERE url LIKE '%JEMSK0001A%'").get() as { status: string; http_status: number };
    expect(audioARow).toMatchObject({ status: 'ok', http_status: 206 });
    // JEMSK0001A is both a JEM event recording and a farbrengen chapter: one object, two refs.
    const refs = store.db.prepare('SELECT collection, item_id, role FROM refs WHERE sha256 = ? ORDER BY collection').all(sha(AUDIO_A)) as Array<{ collection: string; item_id: string; role: string }>;
    expect(refs).toEqual([
      { collection: 'farbrengens', item_id: '500', role: '0' },
      { collection: 'jemEvents', item_id: '1', role: '0' },
    ]);
    const items = unresolved(store);
    expect(items).toHaveLength(1);
    expect(items[0]!.files.map((f) => [f.role, f.http_status])).toEqual([
      ['hagahos', 200],
      ['hosofos', 404],
    ]);
    expect(items[0]!.files[0]!.error).toMatch(/sign-in/);
  });

  it('is a no-op the second time and reports honest stats', async () => {
    const before = requests.length;
    const again = await crawl(store, crawlOptions);
    expect(again.attempted).toBe(0);
    expect(requests.length).toBe(before);
    const s = stats(store);
    expect(s.objects).toMatchObject({ count: 4, audio: 2, pdf: 2 });
    expect(s.wanted).toMatchObject({ urls: 6, fetched: 4, unresolved: 2, errored: 0, pending: 0 });
    expect(s.refs).toBe(5);
    expect(s.commits).toBe(1);
  });

  it('exports an objects index the pack format accepts, farbrengens ids first', () => {
    const index = exportObjectsIndex(store, '1.0.0');
    expect(parseObjectsIndex(JSON.parse(JSON.stringify(index)))).not.toBeNull();
    expect(index.objects[sha(AUDIO_A)]).toMatchObject({ kind: 'audio', profile: 'src', collection: 'farbrengens', itemId: '500', sourceId: 'JEMSK0001A.mp3' });
    expect(index.objects[sha(AUDIO_B)]).toMatchObject({ collection: 'jemEvents', itemId: '2', sourceId: 'AR0020397.mp3' });
    expect(index.objects[sha(PDF_LARGE)]).toMatchObject({ kind: 'pdf', sourceId: DRIVE_LARGE });
  });

  it('verify finds corrupt and missing bytes, keeps the objects and their refs, and the next crawl brings the bytes back', async () => {
    const corrupt = sha(PDF_SMALL);
    const missing = sha(AUDIO_B);
    await writeFile(store.objectPath(corrupt), 'corrupted');
    await rm(store.objectPath(missing));
    const result = await verify(store, { sample: 1 });
    expect(result).toMatchObject({ checked: 4, ok: 2, corrupt: [corrupt], missing: [missing] });
    // History survives: the rows and refs stay, only the bytes are gone until the next crawl.
    expect(store.hasObject(corrupt)).toBe(true);
    expect(await store.objectExistsOnDisk(corrupt)).toBe(false);
    expect(stats(store)).toMatchObject({ objects: { count: 4, lost: 2 }, refs: 5, wanted: { fetched: 2, errored: 2 } });
    expect(store.db.prepare(`SELECT error FROM sources WHERE url LIKE '%${DRIVE_SMALL}%'`).get()).toEqual({ error: 'verify: corrupt' });
    const refetch = await crawl(store, crawlOptions);
    expect(refetch).toMatchObject({ attempted: 2, fetched: 2, errors: 0 });
    expect(await readFile(store.objectPath(corrupt))).toEqual(PDF_SMALL);
    expect(await readFile(store.objectPath(missing))).toEqual(AUDIO_B);
    expect((await verify(store, { sample: 1 })).ok).toBe(4);
    expect(stats(store)).toMatchObject({ objects: { count: 4, lost: 0 }, refs: 5, wanted: { fetched: 4, errored: 0 }, commits: 2 });
  });
});
