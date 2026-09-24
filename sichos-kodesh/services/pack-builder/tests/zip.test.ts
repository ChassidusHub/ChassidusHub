import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEntry, readZipDirectory, writeStoredZip } from '../src/zip.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sk-pack-zip-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('stored ZIP', () => {
  it('writes entries in order, stored, with CRC and sizes in the headers, and reads them back', async () => {
    const big = Buffer.alloc(200_000, 7);
    const bigFile = path.join(dir, 'big.bin');
    await writeFile(bigFile, big);
    const out = path.join(dir, 'a.zip');
    const total = await writeStoredZip(out, [
      { name: 'manifest.json', data: Buffer.from('{"a":1}') },
      { name: 'empty', data: new Uint8Array() },
      { name: 'objects/big', file: bigFile, bytes: big.length },
    ]);
    const entries = await readZipDirectory(out);
    expect(entries.map((e) => e.name)).toEqual(['manifest.json', 'empty', 'objects/big']);
    expect(entries.every((e) => e.method === 0 && e.compressedSize === e.size)).toBe(true);
    expect(entries[2]!.crc32).toBe(crc32(big) >>> 0);
    expect((await readEntry(out, entries[0]!)).toString()).toBe('{"a":1}');
    expect((await readEntry(out, entries[1]!)).length).toBe(0);
    expect((await readEntry(out, entries[2]!)).equals(big)).toBe(true);
    expect(total).toBeGreaterThan(big.length);
  });

  it('gives the same bytes for the same entries', async () => {
    const one = path.join(dir, 'one.zip');
    const two = path.join(dir, 'two.zip');
    await writeStoredZip(one, [{ name: 'x', data: Buffer.from('same') }]);
    await writeStoredZip(two, [{ name: 'x', data: Buffer.from('same') }]);
    const { readFile } = await import('node:fs/promises');
    expect((await readFile(one)).equals(await readFile(two))).toBe(true);
  });

  it('refuses a duplicate name or a file whose size changed, and leaves no file behind', async () => {
    const out = path.join(dir, 'bad.zip');
    await expect(writeStoredZip(out, [{ name: 'x', data: Buffer.from('1') }, { name: 'x', data: Buffer.from('2') }])).rejects.toThrow('duplicate ZIP entry x');
    const file = path.join(dir, 'short.bin');
    await writeFile(file, 'abc');
    await expect(writeStoredZip(out, [{ name: 'objects/short', file, bytes: 4 }])).rejects.toThrow('has 3 bytes, not the 4 listed');
    expect((await readdir(dir)).filter((name) => name.startsWith('bad.zip'))).toEqual([]);
  });

  it('says so when a file is not a ZIP', async () => {
    const file = path.join(dir, 'not.zip');
    await writeFile(file, 'hello');
    await expect(readZipDirectory(file)).rejects.toThrow('not a ZIP file');
  });
});
