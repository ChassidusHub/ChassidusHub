import { describe, expect, it } from 'vitest';
import { crc32 as nodeCrc32 } from 'node:zlib';
import { crc32, planStoredZip, zipLocalHeader } from '../src/zipLayout.js';
import { utf8Bytes } from '../src/canonical.js';

describe('zip layout', () => {
  it('computes the same CRC-32 as zlib, in one go or in chunks', () => {
    const data = utf8Bytes('שיחות קודש '.repeat(1000));
    expect(crc32(data)).toBe(nodeCrc32(data));
    expect(crc32(data.subarray(500), crc32(data.subarray(0, 500)))).toBe(nodeCrc32(data));
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('plans offsets and the exact size before any bytes are sent', () => {
    const a = utf8Bytes('{"schema":1}');
    const b = new Uint8Array(1000).fill(7);
    const entries = [
      { name: 'manifest.json', size: a.length, crc32: crc32(a) },
      { name: 'objects/' + 'a'.repeat(64), size: b.length, crc32: crc32(b) },
    ];
    const plan = planStoredZip(entries);
    expect(plan.offsets).toEqual([0, 30 + 13 + a.length]);
    const bytes = [zipLocalHeader(entries[0]!), a, zipLocalHeader(entries[1]!), b, plan.trailer];
    expect(bytes.reduce((sum, part) => sum + part.length, 0)).toBe(plan.totalBytes);
  });

  it('refuses duplicate names', () => {
    expect(() => planStoredZip([{ name: 'x', size: 0, crc32: 0 }, { name: 'x', size: 0, crc32: 0 }])).toThrow(/duplicate/);
  });
});
