import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PackKeyPair } from '@chassidushub-reader/pack-format';
import { developmentKeyPair, generateKeyPair, keyIdFor } from '@chassidushub-reader/pack-format';

/**
 * The signing key lives in `<archive>/keys/pack-signing.json` (mode 0600)
 * with an offline copy elsewhere; only its public half is committed, to
 * `TRUSTED_PACK_KEYS` in packages/pack-format.
 */

export const KEY_FILE_NAME = 'pack-signing.json';

export function defaultKeyFile(archiveRoot: string): string {
  return path.join(archiveRoot, 'keys', KEY_FILE_NAME);
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Generates a key pair and writes it; refuses to overwrite a key unless `force`. */
export async function createKeyFile(file: string, options: { force?: boolean; seed?: Uint8Array; development?: boolean } = {}): Promise<PackKeyPair> {
  if (!options.force && (await exists(file))) throw new Error(`${file} already exists; a new key would orphan every pack signed with it (use --force to replace it)`);
  const pair = options.development ? developmentKeyPair() : generateKeyPair(options.seed);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(pair, null, 2)}\n`, { mode: 0o600 });
  return pair;
}

/** Reads a key file, checking that its key id belongs to its public key. */
export async function readKeyFile(file: string): Promise<PackKeyPair> {
  const value = JSON.parse(await readFile(file, 'utf8')) as Partial<PackKeyPair>;
  if (typeof value.keyId !== 'string' || typeof value.publicKey !== 'string' || typeof value.secretKey !== 'string') throw new Error(`${file} is not a pack signing key`);
  if (keyIdFor(value.publicKey) !== value.keyId) throw new Error(`${file}: the key id does not match its public key`);
  return { keyId: value.keyId, publicKey: value.publicKey, secretKey: value.secretKey };
}

/** The key's public half, if the file is there; for trusting our own packs in `verify`. */
export async function readPublicKey(file: string): Promise<{ keyId: string; publicKey: string } | null> {
  if (!(await exists(file))) return null;
  const { keyId, publicKey } = await readKeyFile(file);
  return { keyId, publicKey };
}
