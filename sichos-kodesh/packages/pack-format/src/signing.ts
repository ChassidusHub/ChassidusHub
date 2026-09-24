import nacl from 'tweetnacl';
import { fromBase64, toBase64, toHex } from './base64.js';
import { canonicalBytes, utf8Bytes } from './canonical.js';
import type { PackManifest, PackSignature } from './manifest.js';

/**
 * Ed25519 over the canonical JSON of the manifest without its `signature`
 * field (minisign-style, but the signature travels inside the manifest so
 * a pack is one file). Keys are base64: a 32-byte public key, a 64-byte
 * tweetnacl secret key. Verification only needs `tweetnacl`, which runs
 * unchanged in Node, in React Native (JS) and in a browser - nothing here
 * touches Buffer, WebCrypto or node:crypto.
 */

export interface PackKeyPair {
  keyId: string;
  publicKey: string;
  secretKey: string;
}

export type TrustedKeys = Record<string, string>;

/**
 * The keys packs are trusted from: the public halves of the keys made with
 * `sk-pack keygen` (services/pack-builder). The secret halves live only
 * with whoever signs packs, never in this repository. The test suite uses
 * its own throwaway key and never touches this.
 */
export const TRUSTED_PACK_KEYS: TrustedKeys = {
  // The production key, made 2026-09-24.
  aac79a9724647680: 'DVHCrystbVvNVUuU85cp1hwMNlt2FQ/60UmEgjLOJvY=',
};

/**
 * The development key: derived from a published seed, so anyone can sign a
 * pack with it (`sk-pack keygen --dev`) to test an import on a debug build.
 * Debug builds of the app trust it; release builds never do.
 */
export const DEVELOPMENT_KEY_SEED_TEXT = 'sichos-kodesh development pack key v1';

export function developmentKeyPair(): PackKeyPair {
  const seed = nacl.hash(utf8Bytes(DEVELOPMENT_KEY_SEED_TEXT)).slice(0, nacl.sign.seedLength);
  return generateKeyPair(seed);
}

/** `{ keyId: publicKey }` for the development key - for debug builds only. */
export function developmentTrustedKeys(): TrustedKeys {
  const { keyId, publicKey } = developmentKeyPair();
  return { [keyId]: publicKey };
}

/** A key id is the first 16 hex characters of SHA-512 of the public key - short, and derivable by anyone holding the key. */
export function keyIdFor(publicKeyBase64: string): string {
  const publicKey = fromBase64(publicKeyBase64);
  if (!publicKey) throw new TypeError('public key must be base64');
  return toHex(nacl.hash(publicKey)).slice(0, 16);
}

/** Generates a key pair; `seed` (32 bytes) makes it deterministic, for tests. */
export function generateKeyPair(seed?: Uint8Array): PackKeyPair {
  const pair = seed ? nacl.sign.keyPair.fromSeed(seed) : nacl.sign.keyPair();
  const publicKey = toBase64(pair.publicKey);
  return { keyId: keyIdFor(publicKey), publicKey, secretKey: toBase64(pair.secretKey) };
}

/** The bytes a signature covers: the manifest without `signature`, canonical. */
export function manifestSigningBytes(manifest: PackManifest): Uint8Array {
  const { signature: _signature, ...unsigned } = manifest;
  return canonicalBytes(unsigned);
}

export function signManifest(manifest: PackManifest, key: PackKeyPair): PackManifest {
  const secretKey = fromBase64(key.secretKey);
  if (!secretKey || secretKey.length !== nacl.sign.secretKeyLength) throw new TypeError('secret key must be a base64 64-byte tweetnacl signing key');
  const { signature: _signature, ...unsigned } = manifest;
  const sig = nacl.sign.detached(canonicalBytes(unsigned), secretKey);
  const signature: PackSignature = { alg: 'ed25519', keyId: key.keyId, sig: toBase64(sig) };
  return { ...unsigned, signature };
}

export type VerifyResult =
  | { ok: true; keyId: string }
  | { ok: false; reason: 'unsigned' | 'unknown-key' | 'bad-signature' | 'malformed' };

/** Verifies a manifest against a set of trusted keys. Never throws. */
export function verifyManifest(manifest: PackManifest, trusted: TrustedKeys = TRUSTED_PACK_KEYS): VerifyResult {
  const signature = manifest.signature;
  if (!signature) return { ok: false, reason: 'unsigned' };
  const publicKeyBase64 = trusted[signature.keyId];
  if (!publicKeyBase64) return { ok: false, reason: 'unknown-key' };
  const publicKey = fromBase64(publicKeyBase64);
  const sig = fromBase64(signature.sig);
  if (!publicKey || publicKey.length !== nacl.sign.publicKeyLength || !sig || sig.length !== nacl.sign.signatureLength) return { ok: false, reason: 'malformed' };
  try {
    return nacl.sign.detached.verify(manifestSigningBytes(manifest), sig, publicKey) ? { ok: true, keyId: signature.keyId } : { ok: false, reason: 'bad-signature' };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}
