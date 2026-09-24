import { describe, expect, it } from 'vitest';
import { keyIdFor, manifestSigningBytes, signManifest, verifyManifest } from '../src/signing.js';
import { fixtureManifest, testKeyPair } from './fixtures.js';

describe('signing', () => {
  it('signs and verifies with the trusted key, and the key id is derived from the public key', async () => {
    const key = await testKeyPair();
    expect(key.keyId).toBe(keyIdFor(key.publicKey));
    const signed = signManifest(fixtureManifest(), key);
    expect(signed.signature?.keyId).toBe(key.keyId);
    expect(verifyManifest(signed, { [key.keyId]: key.publicKey })).toEqual({ ok: true, keyId: key.keyId });
  });
  it('fails for an unsigned manifest, an unknown key, and any change after signing', async () => {
    const key = await testKeyPair();
    expect(verifyManifest(fixtureManifest(), { [key.keyId]: key.publicKey })).toEqual({ ok: false, reason: 'unsigned' });
    const signed = signManifest(fixtureManifest(), key);
    expect(verifyManifest(signed, {})).toEqual({ ok: false, reason: 'unknown-key' });
    const tampered = { ...signed, catalogVersion: '9.9.9' };
    expect(verifyManifest(tampered, { [key.keyId]: key.publicKey })).toEqual({ ok: false, reason: 'bad-signature' });
    const garbage = { ...signed, signature: { ...signed.signature!, sig: 'not base64!!' } };
    expect(verifyManifest(garbage, { [key.keyId]: key.publicKey })).toEqual({ ok: false, reason: 'malformed' });
  });
  it('signs the same bytes whatever the key order of the object', async () => {
    const key = await testKeyPair();
    const a = fixtureManifest();
    const b = JSON.parse(JSON.stringify({ ...a, entries: a.entries, scope: { label: a.scope.label, kind: a.scope.kind, collection: a.scope.collection, hebrewYear: 5736, month: '01' } }));
    expect(Buffer.from(manifestSigningBytes(a)).equals(Buffer.from(manifestSigningBytes(b)))).toBe(true);
    expect(signManifest(a, key).signature?.sig).toBe(signManifest(b, key).signature?.sig);
  });
});
