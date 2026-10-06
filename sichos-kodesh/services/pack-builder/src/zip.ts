import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, stat, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';

/**
 * The smallest ZIP that does the job: every entry *stored* (method 0), its
 * CRC-32 and sizes in the local header, no data descriptors, no extra
 * fields. That is what Android's `ZipInputStream` streams without seeking
 * (it refuses a stored entry that defers its sizes to a data descriptor),
 * what `unzip -l` lists, and what any file manager opens. Timestamps are
 * fixed at 1980-01-01, so the same entries always give the same bytes.
 *
 * No ZIP64: a pack stays under 4 GiB and 65,535 entries (`--max-mb`
 * splits a scope long before that), and the writer refuses otherwise.
 */

export type ZipSource = { name: string; data: Uint8Array } | { name: string; file: string; bytes: number };

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  crc32: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
  /** Where the entry's bytes start in the file. */
  dataOffset: number;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_NAMES = 0x0800;
const VERSION_STORED = 10;
/** 1980-01-01 00:00 in MS-DOS date/time. */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
const MAX_U32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

async function crcOfFile(file: string): Promise<{ crc: number; size: number }> {
  let crc = 0;
  let size = 0;
  for await (const chunk of createReadStream(file)) {
    crc = crc32(chunk as Buffer, crc);
    size += (chunk as Buffer).length;
  }
  return { crc, size };
}

function localHeader(name: Buffer, crc: number, size: number): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_HEADER, 0);
  header.writeUInt16LE(VERSION_STORED, 4);
  header.writeUInt16LE(UTF8_NAMES, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc >>> 0, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, name]);
}

function centralHeader(name: Buffer, crc: number, size: number, offset: number): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_HEADER, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(VERSION_STORED, 6);
  header.writeUInt16LE(UTF8_NAMES, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(crc >>> 0, 16);
  header.writeUInt32LE(size, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, name]);
}

function endOfCentralDirectory(count: number, size: number, offset: number): Buffer {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  return record;
}

/**
 * Writes the entries, in order, to `out` - through a temporary file that is
 * renamed into place at the end, so a half-written pack never has the
 * pack's name. A file source must still have the size it was listed with.
 * Returns the ZIP's total size.
 */
export async function writeStoredZip(out: string, sources: ZipSource[]): Promise<number> {
  if (sources.length > MAX_ENTRIES) throw new Error(`${sources.length} entries is more than a ZIP without ZIP64 holds`);
  const names = new Set<string>();
  for (const source of sources) {
    if (names.has(source.name)) throw new Error(`duplicate ZIP entry ${source.name}`);
    names.add(source.name);
  }
  const tmp = `${out}.${randomBytes(6).toString('hex')}.tmp`;
  const stream = createWriteStream(tmp);
  let offset = 0;
  const write = async (bytes: Buffer): Promise<void> => {
    offset += bytes.length;
    if (!stream.write(bytes)) await once(stream, 'drain');
  };
  const central: Buffer[] = [];
  try {
    for (const source of sources) {
      const name = Buffer.from(source.name, 'utf8');
      const headerOffset = offset;
      if ('data' in source) {
        const data = Buffer.from(source.data.buffer, source.data.byteOffset, source.data.byteLength);
        const crc = crc32(data);
        await write(localHeader(name, crc, data.length));
        await write(data);
        central.push(centralHeader(name, crc, data.length, headerOffset));
      } else {
        const { crc, size } = await crcOfFile(source.file);
        if (size !== source.bytes) throw new Error(`${source.file} has ${size} bytes, not the ${source.bytes} listed for ${source.name}`);
        if (headerOffset + 30 + name.length + size > MAX_U32) throw new Error('the pack would pass 4 GiB; lower --max-mb');
        await write(localHeader(name, crc, size));
        let copied = 0;
        for await (const chunk of createReadStream(source.file)) {
          copied += (chunk as Buffer).length;
          await write(chunk as Buffer);
        }
        if (copied !== size) throw new Error(`${source.file} changed while it was being packed`);
        central.push(centralHeader(name, crc, size, headerOffset));
      }
    }
    const centralOffset = offset;
    const directory = Buffer.concat(central);
    await write(directory);
    if (offset + 22 > MAX_U32) throw new Error('the pack would pass 4 GiB; lower --max-mb');
    await write(endOfCentralDirectory(sources.length, directory.length, centralOffset));
    stream.end();
    await once(stream, 'finish');
    await rename(tmp, out);
    return offset;
  } catch (error) {
    stream.destroy();
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}

/** The entries of a ZIP, in central-directory order, with where each one's bytes start. */
export async function readZipDirectory(file: string): Promise<ZipEntry[]> {
  const handle = await open(file, 'r');
  try {
    const { size } = await stat(file);
    const tailLength = Math.min(size, 22 + 0xffff);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);
    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('not a ZIP file (no end of central directory)');
    const count = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);
    if (directoryOffset + directorySize > size) throw new Error('ZIP central directory runs past the end of the file');
    const directory = Buffer.alloc(directorySize);
    await handle.read(directory, 0, directorySize, directoryOffset);
    const entries: ZipEntry[] = [];
    let at = 0;
    for (let i = 0; i < count; i += 1) {
      if (at + 46 > directory.length || directory.readUInt32LE(at) !== CENTRAL_HEADER) throw new Error('ZIP central directory is damaged');
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      const localHeaderOffset = directory.readUInt32LE(at + 42);
      const local = Buffer.alloc(30);
      await handle.read(local, 0, 30, localHeaderOffset);
      if (local.readUInt32LE(0) !== LOCAL_HEADER) throw new Error('ZIP local header is damaged');
      entries.push({
        name: directory.toString('utf8', at + 46, at + 46 + nameLength),
        flags: directory.readUInt16LE(at + 8),
        method: directory.readUInt16LE(at + 10),
        crc32: directory.readUInt32LE(at + 16),
        compressedSize: directory.readUInt32LE(at + 20),
        size: directory.readUInt32LE(at + 24),
        localHeaderOffset,
        dataOffset: localHeaderOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28),
      });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    await handle.close();
  }
}

/** A stored entry's bytes as a stream. */
export function entryStream(file: string, entry: ZipEntry): Readable {
  if (entry.compressedSize === 0) return Readable.from([]);
  return createReadStream(file, { start: entry.dataOffset, end: entry.dataOffset + entry.compressedSize - 1 });
}

/** A small stored entry's bytes (the manifest, objects.json). */
export async function readEntry(file: string, entry: ZipEntry): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of entryStream(file, entry)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
