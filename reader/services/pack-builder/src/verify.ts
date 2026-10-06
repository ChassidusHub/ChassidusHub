import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import type { PackManifest, TrustedKeys, VerifyResult } from '@chassidushub-reader/pack-format';
import { CATALOG_ENTRY_NAME, MANIFEST_ENTRY_NAME, OBJECTS_INDEX_ENTRY_NAME, parseObjectsIndex, parsePackManifest, sha256FromEntryName, verifyManifest } from '@chassidushub-reader/pack-format';
import { entryStream, readEntry, readZipDirectory, type ZipEntry } from './zip.js';

/**
 * Everything a phone checks on import, and more: the ZIP is stored-only
 * with the manifest first, the manifest parses and its signature verifies
 * against a trusted key, the object entries are exactly the manifest's
 * objects, and every object's bytes hash to its name (and match the
 * ZIP's own CRC). objects.json and catalog.json, when carried, match the
 * manifest's stamps.
 */

export interface PackCheck {
  ok: boolean;
  problems: string[];
  manifest: PackManifest | null;
  signature: VerifyResult | null;
  zipBytes: number;
  objects: number;
  objectBytes: number;
}

async function hashEntry(file: string, entry: ZipEntry): Promise<{ sha256: string; crc: number; bytes: number }> {
  const hash = createHash('sha256');
  let crc = 0;
  let bytes = 0;
  for await (const chunk of entryStream(file, entry)) {
    hash.update(chunk as Buffer);
    crc = crc32(chunk as Buffer, crc);
    bytes += (chunk as Buffer).length;
  }
  return { sha256: hash.digest('hex'), crc, bytes };
}

const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function verifyPack(file: string, trusted: TrustedKeys): Promise<PackCheck> {
  const problems: string[] = [];
  const check: PackCheck = { ok: false, problems, manifest: null, signature: null, zipBytes: (await stat(file)).size, objects: 0, objectBytes: 0 };
  let entries: ZipEntry[];
  try {
    entries = await readZipDirectory(file);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
    return check;
  }

  const byName = new Map<string, ZipEntry>();
  for (const entry of entries) {
    if (byName.has(entry.name)) problems.push(`${entry.name} appears twice`);
    byName.set(entry.name, entry);
    if (entry.method !== 0) problems.push(`${entry.name} is compressed (method ${entry.method}); a pack stores every entry`);
    if (entry.compressedSize !== entry.size) problems.push(`${entry.name}: stored size ${entry.compressedSize} is not its size ${entry.size}`);
  }
  if (entries[0]?.name !== MANIFEST_ENTRY_NAME) problems.push(`${MANIFEST_ENTRY_NAME} is not the first entry`);

  const manifestEntry = byName.get(MANIFEST_ENTRY_NAME);
  if (!manifestEntry) {
    problems.push(`no ${MANIFEST_ENTRY_NAME}`);
    return check;
  }
  let manifest: PackManifest | null = null;
  try {
    manifest = parsePackManifest(JSON.parse((await readEntry(file, manifestEntry)).toString('utf8')));
  } catch {
    manifest = null;
  }
  if (!manifest) {
    problems.push(`${MANIFEST_ENTRY_NAME} is not a valid pack manifest`);
    return check;
  }
  check.manifest = manifest;
  check.signature = verifyManifest(manifest, trusted);
  if (!check.signature.ok) problems.push(`signature: ${check.signature.reason}`);

  const objectEntries = new Map<string, ZipEntry>();
  for (const entry of entries) {
    const sha = sha256FromEntryName(entry.name);
    if (sha) objectEntries.set(sha, entry);
    else if (![MANIFEST_ENTRY_NAME, OBJECTS_INDEX_ENTRY_NAME, CATALOG_ENTRY_NAME].includes(entry.name)) problems.push(`unexpected entry ${entry.name}`);
  }
  for (const [sha, bytes] of Object.entries(manifest.objects)) {
    const entry = objectEntries.get(sha);
    if (!entry) problems.push(`object ${sha} is listed but not in the pack`);
    else if (entry.size !== bytes) problems.push(`object ${sha} has ${entry.size} bytes, the manifest says ${bytes}`);
  }
  for (const [sha, entry] of objectEntries) {
    if (manifest.objects[sha] === undefined) {
      problems.push(`object ${sha} is in the pack but not listed`);
      continue;
    }
    const hashed = await hashEntry(file, entry);
    if (hashed.sha256 !== sha) problems.push(`object ${sha} hashes to ${hashed.sha256}`);
    if (hashed.crc >>> 0 !== entry.crc32 >>> 0) problems.push(`object ${sha} fails the ZIP's CRC-32`);
    check.objects += 1;
    check.objectBytes += hashed.bytes;
  }

  const stamped = async (name: string, stamp: { version: string; sha256: string } | undefined, parse: (bytes: Buffer) => string | null) => {
    const entry = byName.get(name);
    if (!stamp) {
      if (entry) problems.push(`${name} is carried but the manifest does not stamp it`);
      return;
    }
    if (!entry) {
      problems.push(`the manifest stamps ${name} but the pack does not carry it`);
      return;
    }
    const bytes = await readEntry(file, entry);
    if (sha256Hex(bytes) !== stamp.sha256) problems.push(`${name} does not match its sha256 in the manifest`);
    const version = parse(bytes);
    if (version === null) problems.push(`${name} does not parse`);
    else if (version !== stamp.version) problems.push(`${name} is version ${version}, the manifest says ${stamp.version}`);
  };
  const jsonVersion = (bytes: Buffer, read: (value: unknown) => string | null): string | null => {
    try {
      return read(JSON.parse(bytes.toString('utf8')));
    } catch {
      return null;
    }
  };
  await stamped(OBJECTS_INDEX_ENTRY_NAME, manifest.objectsIndex, (bytes) => jsonVersion(bytes, (value) => parseObjectsIndex(value)?.version ?? null));
  await stamped(CATALOG_ENTRY_NAME, manifest.catalog, (bytes) =>
    jsonVersion(bytes, (value) => (value && typeof value === 'object' && typeof (value as { version?: unknown }).version === 'string' ? (value as { version: string }).version : null)),
  );

  check.ok = problems.length === 0;
  return check;
}
