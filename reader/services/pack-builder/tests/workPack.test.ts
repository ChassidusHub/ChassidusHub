import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ArchiveStore, importText } from '@chassidushub-reader/archive';
import type { CatalogWork, CatalogWorkContents } from '@chassidushub-reader/catalog';
import type { PackKeyPair, TrustedKeys } from '@chassidushub-reader/pack-format';
import { SEARCH_INDEX_QUERY, generateKeyPair, searchIndexQuery, workTextSourceId } from '@chassidushub-reader/pack-format';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyPack } from '../src/verify.js';
import { buildWorkPack, workPackFileName } from '../src/workPack.js';
import { readEntry, readZipDirectory } from '../src/zip.js';

// Invented texts in the shape the Sefaria import writes - not real editions.
const TEXTS = {
  one: '<article dir="rtl" lang="he"><h1>פרק א׳</h1><p>וְהַבֵּינוֹנִי <b>אַהֲבָה מְסוּתֶּרֶת</b></p><footer class="source">Kehot · CC BY-NC · Sefaria</footer></article>\n',
  two: '<article dir="rtl" lang="he"><h1>פרק ב׳</h1><p>הַשְּׁכִינָה</p></article>\n',
  english: '<article dir="ltr" lang="en"><h1>Chapter 1</h1><p>The hidden love</p></article>\n',
};
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const bytes = (text: string) => Buffer.byteLength(text, 'utf8');

const work: CatalogWork = {
  id: 'tanya',
  title: { he: 'תניא', en: 'Tanya' },
  authors: ['alter-rebbe'],
  genre: 'chassidus',
  levels: [],
  sources: [
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'he', licence: 'cc-by-nc', rights: 'ship-with-credit', version: 'Kehot' },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'en', licence: 'cc0', rights: 'ship', version: 'Community' },
  ],
  units: 2,
};
const contents: CatalogWorkContents = {
  workId: 'tanya',
  contents: [{ unitId: '1' }, { unitId: '2' }],
  units: [
    { id: '1', label: 'פרק א׳', labelEn: 'Chapter 1', editions: [{ source: 0, sha256: sha(TEXTS.one), bytes: bytes(TEXTS.one) }, { source: 1, sha256: sha(TEXTS.english), bytes: bytes(TEXTS.english) }] },
    { id: '2', label: 'פרק ב׳', editions: [{ source: 0, sha256: sha(TEXTS.two), bytes: bytes(TEXTS.two) }] },
  ],
};

let dir: string;
let store: ArchiveStore;
let key: PackKeyPair;
let trusted: TrustedKeys;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sk-work-pack-'));
  store = await ArchiveStore.open(path.join(dir, 'archive'));
  const record = (unitId: string, text: string) => ({ collection: 'works', itemId: `tanya/${unitId}`, sourceId: workTextSourceId('tanya', sha(text)), text, mime: 'text/html; charset=utf-8' });
  await importText(store, [record('1', TEXTS.one), record('1', TEXTS.english), record('2', TEXTS.two)], { author: 'test', message: 'test' });
  key = generateKeyPair(new Uint8Array(32).fill(7));
  trusted = { [key.keyId]: key.publicKey };
});

afterAll(async () => {
  store.close();
  await rm(dir, { recursive: true, force: true });
});

const options = (outDir: string) => ({ work, contents, catalogVersion: '1.3.0', outDir, key, maxBytes: 1024 * 1024, allowMissing: false, now: () => new Date('2026-09-24T00:00:00Z') });

describe('buildWorkPack', () => {
  it('packs the texts and a search index into one signed pack the readers accept', async () => {
    const result = await buildWorkPack(store, options(path.join(dir, 'a')));
    expect(result.packs).toHaveLength(1);
    expect(path.basename(result.packs[0]!.file)).toBe(workPackFileName('tanya'));
    expect(result.texts).toBe(3);
    const check = await verifyPack(result.packs[0]!.file, trusted);
    expect(check.problems).toEqual([]);
    const manifest = check.manifest!;
    expect(manifest.scope).toMatchObject({ kind: 'work', collection: 'works', work: 'tanya' });
    expect(manifest.entries.map((e) => e.itemId)).toEqual(['tanya', 'tanya/1', 'tanya/2']);
    expect(manifest.entries[0]!.refs[0]).toMatchObject({ kind: 'search', sha256: result.search.sha256 });
  });

  it('builds an index the phone can query: Hebrew without niqqud, by stem, and English', async () => {
    const result = await buildWorkPack(store, options(path.join(dir, 'b')));
    const file = result.packs[0]!.file;
    const entry = (await readZipDirectory(file)).find((e) => e.name.includes(result.search.sha256))!;
    const indexFile = path.join(dir, 'search.sqlite');
    await writeFile(indexFile, await readEntry(file, entry));
    const db = new DatabaseSync(indexFile, { readOnly: true });
    const find = (query: string) => (db.prepare(SEARCH_INDEX_QUERY).all(searchIndexQuery(query), 10) as Array<{ unit: string; source: number }>).map((r) => `${r.unit}@${r.source}`);
    expect(find('בינוני')).toEqual(['1@0']);
    expect(find('אהבה מסותרת')).toEqual(['1@0']);
    expect(find('שכינה')).toEqual(['2@0']);
    expect(find('hidden love')).toEqual(['1@1']);
    // The heading and the credit line are not searched as text.
    expect(find('Kehot')).toEqual([]);
    expect(db.prepare("SELECT value FROM meta WHERE key = 'format'").get()).toEqual({ value: '1' });
    db.close();
  });

  it('builds the same pack from the same texts', async () => {
    const a = await buildWorkPack(store, options(path.join(dir, 'c1')));
    const b = await buildWorkPack(store, options(path.join(dir, 'c2')));
    expect(b.search.sha256).toBe(a.search.sha256);
    expect(b.packs[0]!.manifest.packId).toBe(a.packs[0]!.manifest.packId);
  });

  it('refuses texts the archive lacks, unless told to leave them out', async () => {
    const missing = structuredClone(contents);
    missing.units[1]!.editions[0]!.sha256 = 'f'.repeat(64);
    await expect(buildWorkPack(store, { ...options(path.join(dir, 'd')), contents: missing })).rejects.toThrow(/not in the archive/);
    const partial = await buildWorkPack(store, { ...options(path.join(dir, 'd')), contents: missing, allowMissing: true });
    expect(partial.missing).toEqual(['f'.repeat(64)]);
    expect(partial.packs[0]!.manifest.entries.map((e) => e.itemId)).toEqual(['tanya', 'tanya/1']);
  });
});
