import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/canonical.js';

describe('canonicalJson', () => {
  it('sorts keys at every level, drops undefined, keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1, 2], c: null }, u: undefined })).toBe('{"a":{"c":null,"d":[3,1,2]},"b":1}');
  });
  it('is stable for the same value built in a different order', () => {
    expect(canonicalJson({ x: 1, y: 'ש' })).toBe(canonicalJson({ y: 'ש', x: 1 }));
  });
  it('refuses what JSON cannot round-trip', () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow();
    expect(() => canonicalJson(undefined)).toThrow();
  });
});

import { fromBase64, toBase64, utf8Bytes } from '../src/index.js';

describe('utf8 and base64 without platform APIs', () => {
  it('encodes Hebrew, ASCII and astral characters like TextEncoder', () => {
    for (const text of ['abc', 'שלום', 'ערב יו"כ, אחרי מנחה', '𝄞 music', '']) {
      expect(Buffer.from(utf8Bytes(text))).toEqual(Buffer.from(text, 'utf8'));
    }
  });
  it('round-trips base64 like Buffer and rejects malformed input', () => {
    for (const len of [0, 1, 2, 3, 4, 31, 32, 63, 64]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) % 256);
      const text = toBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64'));
      expect(Buffer.from(fromBase64(text)!)).toEqual(Buffer.from(bytes));
    }
    expect(fromBase64('not base64!!')).toBeNull();
    expect(fromBase64('abc')).toBeNull();
  });
});
