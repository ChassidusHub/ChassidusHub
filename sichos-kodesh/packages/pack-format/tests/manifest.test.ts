import { describe, expect, it } from 'vitest';
import { manifestBytes, objectEntryName, parsePackManifest, sha256FromEntryName } from '../src/manifest.js';
import { AUDIO_A, PDF_1, SHA_AUDIO_A, fixtureManifest } from './fixtures.js';

describe('parsePackManifest', () => {
  it('accepts the fixture and returns an equal manifest', () => {
    const manifest = fixtureManifest();
    expect(parsePackManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
  });
  it('rejects a manifest whose entry refers to an unlisted object, a wrong schema, a bad hash', () => {
    const manifest = fixtureManifest();
    const unlisted = JSON.parse(JSON.stringify(manifest));
    delete unlisted.objects[SHA_AUDIO_A];
    expect(parsePackManifest(unlisted)).toBeNull();
    expect(parsePackManifest({ ...manifest, schema: 2 })).toBeNull();
    expect(parsePackManifest({ ...manifest, objects: { ...manifest.objects, notahash: 3 } })).toBeNull();
    expect(parsePackManifest({ ...manifest, part: { index: 2, count: 2, setId: 'x' } })).toBeNull();
    expect(parsePackManifest(null)).toBeNull();
    expect(parsePackManifest('{}')).toBeNull();
  });
  it('sums object bytes and maps entry names', () => {
    expect(manifestBytes(fixtureManifest())).toBe(AUDIO_A.byteLength + PDF_1.byteLength + 'fake mp3 bytes for JEMSK0001B'.length);
    expect(sha256FromEntryName(objectEntryName(SHA_AUDIO_A))).toBe(SHA_AUDIO_A);
    expect(sha256FromEntryName('objects/short')).toBeNull();
    expect(sha256FromEntryName('manifest.json')).toBeNull();
  });
});
