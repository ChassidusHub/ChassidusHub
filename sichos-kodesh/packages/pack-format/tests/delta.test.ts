import { describe, expect, it } from 'vitest';
import { choosePacks, computeDelta } from '../src/delta.js';
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
