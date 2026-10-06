import { describe, expect, it } from 'vitest';
import { choosePacks, computeDelta, parsePackIndexFile } from '../src/delta.js';
import type { PackIndexEntry } from '../src/delta.js';
import { SHA_AUDIO_A, SHA_AUDIO_B, SHA_PDF_1, SHA_PDF_2, fixtureManifest } from './fixtures.js';

describe('computeDelta', () => {
  it('is set difference over hashes', () => {
    const manifest = fixtureManifest();
    const delta = computeDelta(manifest, [SHA_AUDIO_A]);
    expect(delta.missing).toEqual([SHA_AUDIO_B, SHA_PDF_1]);
    expect(delta.present).toBe(1);
    expect(delta.missingBytes + delta.presentBytes).toBe(Object.values(manifest.objects).reduce((a, b) => a + b, 0));
    expect(computeDelta(manifest, Object.keys(manifest.objects)).missing).toEqual([]);
  });
});

describe('choosePacks', () => {
  const entry = (packId: string, objects: Record<string, number>): PackIndexEntry => ({
    packId,
    file: `${packId}.skpack`,
    bytes: 0,
    sha256: 'a'.repeat(64),
    catalogVersion: '1.0.0',
    profile: 'src',
    scope: { kind: 'custom', collection: 'farbrengens', label: { en: packId, he: packId } },
    objects,
  });
  it('picks the biggest gain first and does not count overlap twice', () => {
    const index = [
      entry('small', { [SHA_PDF_2]: 10 }),
      entry('big', { [SHA_AUDIO_A]: 100, [SHA_AUDIO_B]: 100, [SHA_PDF_1]: 5 }),
      entry('overlap', { [SHA_AUDIO_A]: 100, [SHA_PDF_2]: 10 }),
    ];
    const chosen = choosePacks(index, [SHA_PDF_1]);
    expect(chosen.map((c) => c.entry.packId)).toEqual(['big', 'small']);
    expect(chosen[0]!.delta.missing).toEqual([SHA_AUDIO_A, SHA_AUDIO_B]);
    expect(choosePacks(index, [SHA_AUDIO_A, SHA_AUDIO_B, SHA_PDF_1, SHA_PDF_2])).toEqual([]);
  });
});

describe('parsePackIndexFile', () => {
  const pack = {
    packId: 'p1',
    file: '5736-01-tishrei-src.skpack',
    bytes: 1234,
    sha256: 'b'.repeat(64),
    catalogVersion: '1.0.0',
    profile: 'src',
    scope: { kind: 'month', collection: 'farbrengens', hebrewYear: 5736, month: '01', label: { en: 'Tishrei 5736', he: 'תשרי' } },
    objects: { [SHA_AUDIO_A]: 100 },
  };
  it('reads a valid index, keeping a part when there is one', () => {
    const parsed = parsePackIndexFile({ schema: 1, builtAt: '2026-09-24T00:00:00.000Z', packs: [pack, { ...pack, packId: 'p2', part: { index: 1, count: 2, setId: 's' } }] });
    expect(parsed?.packs).toHaveLength(2);
    expect(parsed?.packs[0]).toEqual(pack);
    expect(parsed?.packs[1]?.part).toEqual({ index: 1, count: 2, setId: 's' });
  });
  it('rejects the whole file for one bad entry', () => {
    const file = (packs: unknown[]) => ({ schema: 1, builtAt: '2026-09-24T00:00:00.000Z', packs });
    expect(parsePackIndexFile(file([{ ...pack, file: '../escape.skpack' }]))).toBeNull();
    expect(parsePackIndexFile(file([{ ...pack, sha256: 'nope' }]))).toBeNull();
    expect(parsePackIndexFile(file([{ ...pack, profile: 'flac' }]))).toBeNull();
    expect(parsePackIndexFile(file([{ ...pack, objects: { nothex: 1 } }]))).toBeNull();
    expect(parsePackIndexFile({ schema: 2, builtAt: 'x', packs: [] })).toBeNull();
  });
});
