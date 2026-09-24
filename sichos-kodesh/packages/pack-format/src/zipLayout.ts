import { utf8Bytes } from './canonical.js';

/**
 * The stored-ZIP layout of a pack, as pure bytes: no Node, no streams. The
 * pack builder writes files with it and the pack API (a Worker) streams
 * with it, so a pack built either way is the same bytes.
 *
 * Every entry is stored (method 0), with its CRC-32 and sizes in the local
 * header: no data descriptors, no extra fields, timestamps fixed at
 * 1980-01-01. That is what Android's `ZipInputStream` streams without
 * seeking. No ZIP64: under 4 GiB and 65,535 entries.
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_NAMES = 0x0800;
const VERSION_STORED = 10;
const VERSION_MADE_BY = 20;
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
export const ZIP_MAX_BYTES = 0xffffffff;
export const ZIP_MAX_ENTRIES = 0xffff;

let crcTable: Uint32Array | null = null;

function table(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

/** CRC-32 (the ZIP one), continuing from `previous` so large objects can be fed in chunks. */
export function crc32(bytes: Uint8Array, previous = 0): number {
  const t = table();
  let crc = (previous ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i += 1) crc = t[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** One entry as the layout needs it: its name, size and CRC, known before its bytes are sent. */
export interface ZipLayoutEntry {
  name: string;
  size: number;
  crc32: number;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function zipLocalHeader(entry: ZipLayoutEntry): Uint8Array {
  const name = utf8Bytes(entry.name);
  const out = new Uint8Array(30 + name.length);
  const v = view(out);
  v.setUint32(0, LOCAL_HEADER, true);
  v.setUint16(4, VERSION_STORED, true);
  v.setUint16(6, UTF8_NAMES, true);
  v.setUint16(8, 0, true);
  v.setUint16(10, DOS_TIME, true);
  v.setUint16(12, DOS_DATE, true);
  v.setUint32(14, entry.crc32 >>> 0, true);
  v.setUint32(18, entry.size, true);
  v.setUint32(22, entry.size, true);
  v.setUint16(26, name.length, true);
  v.setUint16(28, 0, true);
  out.set(name, 30);
  return out;
}

export function zipCentralHeader(entry: ZipLayoutEntry, localHeaderOffset: number): Uint8Array {
  const name = utf8Bytes(entry.name);
  const out = new Uint8Array(46 + name.length);
  const v = view(out);
  v.setUint32(0, CENTRAL_HEADER, true);
  v.setUint16(4, VERSION_MADE_BY, true);
  v.setUint16(6, VERSION_STORED, true);
  v.setUint16(8, UTF8_NAMES, true);
  v.setUint16(10, 0, true);
  v.setUint16(12, DOS_TIME, true);
  v.setUint16(14, DOS_DATE, true);
  v.setUint32(16, entry.crc32 >>> 0, true);
  v.setUint32(20, entry.size, true);
  v.setUint32(24, entry.size, true);
  v.setUint16(28, name.length, true);
  v.setUint32(42, localHeaderOffset, true);
  out.set(name, 46);
  return out;
}

export function zipEndOfCentralDirectory(count: number, centralSize: number, centralOffset: number): Uint8Array {
  const out = new Uint8Array(22);
  const v = view(out);
  v.setUint32(0, END_OF_CENTRAL_DIRECTORY, true);
  v.setUint16(8, count, true);
  v.setUint16(10, count, true);
  v.setUint32(12, centralSize, true);
  v.setUint32(16, centralOffset, true);
  return out;
}

export interface ZipPlan {
  /** Each entry's local header offset, in order. */
  offsets: number[];
  /** The whole central directory plus end record, to send after the last entry. */
  trailer: Uint8Array;
  /** The ZIP's exact size: a server can send Content-Length before a byte. */
  totalBytes: number;
}

/**
 * Plans a ZIP from its entries alone, so its size is known up front and the
 * bytes can be streamed in one pass. Throws past the no-ZIP64 limits or on
 * a duplicate name.
 */
export function planStoredZip(entries: ZipLayoutEntry[]): ZipPlan {
  if (entries.length > ZIP_MAX_ENTRIES) throw new Error(`${entries.length} entries is more than a ZIP without ZIP64 holds`);
  const names = new Set<string>();
  const offsets: number[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (names.has(entry.name)) throw new Error(`duplicate ZIP entry ${entry.name}`);
    names.add(entry.name);
    offsets.push(offset);
    central.push(zipCentralHeader(entry, offset));
    offset += 30 + utf8Bytes(entry.name).length + entry.size;
    if (offset > ZIP_MAX_BYTES) throw new Error('the ZIP would pass 4 GiB');
  }
  const centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0);
  const trailer = new Uint8Array(centralSize + 22);
  let at = 0;
  for (const bytes of central) {
    trailer.set(bytes, at);
    at += bytes.length;
  }
  trailer.set(zipEndOfCentralDirectory(entries.length, centralSize, offset), at);
  return { offsets, trailer, totalBytes: offset + trailer.length };
}
