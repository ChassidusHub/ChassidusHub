import RNBlobUtil from 'react-native-blob-util';
import type { AudioProfile, CollectionId, ObjectKind, ObjectsIndex, PackManifest, VerifyResult } from '@sichos-kodesh/pack-format';
import { CATALOG_ENTRY_NAME, MANIFEST_ENTRY_NAME, OBJECTS_INDEX_ENTRY_NAME, objectEntryName, parseObjectsIndex, parsePackManifest, verifyManifest } from '@sichos-kodesh/pack-format';
import { compareCatalogVersions, parseCatalogReleaseFile } from '@sichos-kodesh/catalog';
import type { CatalogByYear } from '@sichos-kodesh/catalog';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import { catalogStore, getCatalog } from '../catalog/catalogStore';
import { writeStoredCatalog } from '../catalog/catalogStorage';
import { upsertStoredDownloads } from '../download/downloadStorage';
import { findCatalogEntry, targetsBySourceId } from './catalogTargets';
import type { HeldObject } from './objectStore';
import { documentPath, readHeldObjects, recordHeldObjects, recordInstalledPack, storeTrustedObjectsIndex } from './objectStore';
import type { NativeImportItem, PacksNativeModule } from './packsNative';
import { IMPORT_SPACE_MARGIN, isImportableProfile, objectFileName, trustedPackKeys } from './placement';

/**
 * Importing a signed pack (`.skpack`, docs/offline-plan.md WP4 item 2):
 *
 * 1. Read `manifest.json`, the first entry, and verify its signature here
 *    in JS (tweetnacl, tens of KB). An unsigned or foreign-key pack is not
 *    imported as a pack; the caller takes its files as a shared ZIP.
 * 2. Plan against what the phone holds: an object whose hash is recorded
 *    and whose file is there, or whose file is there at the pack's size, is
 *    skipped. Only the rest is written, so a second import of the same pack
 *    writes nothing.
 * 3. Stream the ZIP once, natively. Each object is hashed on the way and
 *    moved into place only when its SHA-256 and size are the manifest's.
 *    `objects.json` and `catalog.json` come in the same pass, checked
 *    against the signed stamps.
 * 4. Apply a newer catalog, remember the objects index, record the objects
 *    and a StoredDownloadRecord per catalog target, so every screen shows
 *    the files as downloaded.
 */

/** A year pack's manifest lists thousands of refs; anything this big is not ours. */
export const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;

const INCOMING_INDEX = 'offline/incoming-objects.json';
const INCOMING_CATALOG = 'offline/incoming-catalog.json';

export interface PlannedObject {
  sha256: string;
  bytes: number;
  kind: ObjectKind;
  profile?: AudioProfile;
  sourceId: string;
  file: string;
  collection: CollectionId;
  itemId: string;
  hebrewYear?: number;
}

export interface PackImportPlan {
  /** Objects to write, one per hash. */
  write: PlannedObject[];
  /** Objects already on the phone. */
  present: PlannedObject[];
  /** Recordings in an audio profile this build does not take (see placement.ts). */
  unsupported: number;
  /** Refs whose id is not a safe file name; never written. */
  unplaceable: number;
  bytesToWrite: number;
  /** Every placeable ref, per entry, for the download records (an object can serve several items). */
  refs: PlannedObject[];
}

/** What the phone holds, gathered before planning. */
export interface PhoneState {
  /** Hashes in the object store whose file still exists, mapped to that file. */
  held: Map<string, string>;
  /** Files recognised only by name (no trusted hash): a pack's verified copy replaces them. */
  unverifiedFiles: Set<string>;
  /** Existing files (relative to the files directory) and their sizes. */
  fileSizes: Map<string, number>;
}

/** Pure: which of a manifest's objects to write. */
export function planPackImport(manifest: PackManifest, phone: PhoneState): PackImportPlan {
  const plan: PackImportPlan = { write: [], present: [], unsupported: 0, unplaceable: 0, bytesToWrite: 0, refs: [] };
  const decided = new Set<string>();
  const claimedFiles = new Set<string>();
  for (const entry of manifest.entries) {
    for (const ref of entry.refs) {
      const profile = ref.kind === 'audio' ? (ref.profile ?? manifest.profile.audio) : undefined;
      const file = objectFileName(ref.kind, ref.sourceId, profile);
      if (!file) {
        if (!decided.has(ref.sha256)) {
          decided.add(ref.sha256);
          if (!isImportableProfile(ref.kind, profile)) plan.unsupported += 1;
          else plan.unplaceable += 1;
        }
        continue;
      }
      const object: PlannedObject = { sha256: ref.sha256, bytes: ref.bytes, kind: ref.kind, sourceId: ref.sourceId, file, collection: entry.collection, itemId: entry.itemId };
      if (profile) object.profile = profile;
      if (entry.hebrewYear !== undefined) object.hebrewYear = entry.hebrewYear;
      plan.refs.push(object);
      if (decided.has(ref.sha256)) continue;
      decided.add(ref.sha256);
      const size = phone.fileSizes.get(file);
      const heldAt = phone.held.get(ref.sha256);
      const onPhone = (heldAt === file && size !== undefined) || (size === ref.bytes && !phone.unverifiedFiles.has(file));
      if (onPhone || claimedFiles.has(file)) {
        plan.present.push(object);
        continue;
      }
      claimedFiles.add(file);
      plan.write.push(object);
      plan.bytesToWrite += ref.bytes;
    }
  }
  return plan;
}

export interface ReadManifest {
  manifest: PackManifest;
  verify: VerifyResult;
}

/** The pack's manifest and whether its signature is trusted; null when the first entry is not a manifest. */
export async function readPackManifest(native: PacksNativeModule, uri: string): Promise<ReadManifest | null> {
  let text: string | null;
  try {
    text = await native.readEntry(uri, MANIFEST_ENTRY_NAME, true, MAX_MANIFEST_BYTES);
  } catch {
    return null;
  }
  if (!text) return null;
  let manifest: PackManifest | null = null;
  try {
    manifest = parsePackManifest(JSON.parse(text));
  } catch {
    manifest = null;
  }
  if (!manifest) return null;
  return { manifest, verify: verifyManifest(manifest, trustedPackKeys()) };
}

async function listSizes(relativeDir: string, prefix: string, into: Map<string, number>): Promise<void> {
  const dir = relativeDir ? documentPath(relativeDir) : RNBlobUtil.fs.dirs.DocumentDir;
  let names: string[] = [];
  try {
    if (!(await RNBlobUtil.fs.exists(dir))) return;
    names = await RNBlobUtil.fs.ls(dir);
  } catch {
    return;
  }
  for (const name of names) into.set(`${prefix}${name}`, -1);
}

/** Sizes are read only for the files a plan asks about; listing a directory is one call. */
export async function readPhoneState(candidates: Iterable<string>): Promise<PhoneState> {
  const listed = new Map<string, number>();
  await listSizes('', '', listed);
  await listSizes('texts', 'texts/', listed);
  const fileSizes = new Map<string, number>();
  for (const file of new Set(candidates)) {
    if (!listed.has(file)) continue;
    try {
      const stat = await RNBlobUtil.fs.stat(documentPath(file));
      fileSizes.set(file, Number(stat.size));
    } catch {
      // Gone between the listing and the stat.
    }
  }
  const held = new Map<string, string>();
  const unverifiedFiles = new Set<string>();
  for (const object of Object.values(await readHeldObjects())) {
    if (!listed.has(object.file)) continue;
    held.set(object.sha256, object.file);
    if (!object.verified) unverifiedFiles.add(object.file);
  }
  return { held, unverifiedFiles, fileSizes };
}

export type PackImportOutcome =
  | {
      status: 'imported';
      manifest: PackManifest;
      keyId: string;
      added: number;
      addedBytes: number;
      present: number;
      unsupported: number;
      failed: number;
      failures: string[];
      catalogApplied?: string;
    }
  | { status: 'not-a-pack' }
  | { status: 'untrusted'; manifest: PackManifest; reason: Exclude<VerifyResult, { ok: true }>['reason'] }
  | { status: 'no-space'; manifest: PackManifest; needed: number; free: number };

async function readJson(relative: string): Promise<unknown> {
  try {
    return JSON.parse(String(await RNBlobUtil.fs.readFile(documentPath(relative), 'utf8')));
  } catch {
    return null;
  } finally {
    RNBlobUtil.fs.unlink(documentPath(relative)).catch(() => undefined);
  }
}

/** Applies the pack's catalog when it is newer than the phone's. Returns the version applied. */
async function applyPackCatalog(): Promise<string | undefined> {
  const release = parseCatalogReleaseFile(await readJson(INCOMING_CATALOG));
  if (!release) return undefined;
  if (compareCatalogVersions(release.version, catalogStore.get().version) <= 0) return undefined;
  if (!catalogStore.apply(release, 'fetched')) return undefined;
  await writeStoredCatalog(release);
  return release.version;
}

/** One StoredDownloadRecord per catalog target the imported farbrengen files serve. */
export function downloadRecordsFor(objects: PlannedObject[], catalog: CatalogByYear): Array<{ target: DownloadTarget; localPath: string }> {
  const byEntry = new Map<string, Map<string, DownloadTarget[]>>();
  const items: Array<{ target: DownloadTarget; localPath: string }> = [];
  for (const object of objects) {
    if (object.collection !== 'farbrengens' || object.hebrewYear === undefined) continue;
    const key = `${object.hebrewYear}:${object.itemId}`;
    let targets = byEntry.get(key);
    if (!targets) {
      const entry = findCatalogEntry(catalog, object.hebrewYear, Number(object.itemId));
      targets = entry ? targetsBySourceId([entry]) : new Map();
      byEntry.set(key, targets);
    }
    for (const target of targets.get(object.sourceId) ?? []) items.push({ target, localPath: documentPath(object.file) });
  }
  return items;
}

export async function importPack(native: PacksNativeModule, uri: string, jobId: string, read?: ReadManifest | null): Promise<PackImportOutcome> {
  const head = read === undefined ? await readPackManifest(native, uri) : read;
  if (!head) return { status: 'not-a-pack' };
  const { manifest, verify } = head;
  if (!verify.ok) return { status: 'untrusted', manifest, reason: verify.reason };

  const candidates = manifest.entries.flatMap((entry) =>
    entry.refs.map((ref) => objectFileName(ref.kind, ref.sourceId, ref.kind === 'audio' ? (ref.profile ?? manifest.profile.audio) : undefined)).filter((file): file is string => !!file),
  );
  const plan = planPackImport(manifest, await readPhoneState(candidates));

  const wantCatalog = !!manifest.catalog && compareCatalogVersions(manifest.catalog.version, catalogStore.get().version) > 0;
  const items: NativeImportItem[] = [];
  if (manifest.objectsIndex) items.push({ entry: OBJECTS_INDEX_ENTRY_NAME, dest: INCOMING_INDEX, sha256: manifest.objectsIndex.sha256 });
  if (wantCatalog && manifest.catalog) items.push({ entry: CATALOG_ENTRY_NAME, dest: INCOMING_CATALOG, sha256: manifest.catalog.sha256 });
  for (const object of plan.write) items.push({ entry: objectEntryName(object.sha256), dest: object.file, sha256: object.sha256, bytes: object.bytes });

  const device = await native.deviceInfo();
  const needed = plan.bytesToWrite + IMPORT_SPACE_MARGIN;
  if (plan.write.length > 0 && device.freeBytes < needed) return { status: 'no-space', manifest, needed, free: device.freeBytes };

  const results = items.length > 0 ? await native.importEntries(uri, jobId, items) : [];
  const okEntries = new Set(results.filter((r) => r.ok).map((r) => r.entry));
  const failures = results.filter((r) => !r.ok && r.entry !== OBJECTS_INDEX_ENTRY_NAME && r.entry !== CATALOG_ENTRY_NAME).map((r) => `${r.entry}: ${r.error ?? 'failed'}`);

  if (okEntries.has(OBJECTS_INDEX_ENTRY_NAME)) {
    const index: ObjectsIndex | null = parseObjectsIndex(await readJson(INCOMING_INDEX));
    if (index) await storeTrustedObjectsIndex(index);
  }
  const catalogApplied = okEntries.has(CATALOG_ENTRY_NAME) ? await applyPackCatalog() : undefined;

  const written = plan.write.filter((object) => okEntries.has(objectEntryName(object.sha256)));
  const now = new Date().toISOString();
  const heldRecords: HeldObject[] = written.map((object) => ({
    sha256: object.sha256,
    bytes: object.bytes,
    kind: object.kind,
    ...(object.profile ? { profile: object.profile } : {}),
    sourceId: object.sourceId,
    file: object.file,
    collection: object.collection,
    itemId: object.itemId,
    source: 'pack',
    verified: true,
    addedAt: now,
  }));
  await recordHeldObjects(heldRecords);

  const onPhone = new Set([...written, ...plan.present].map((object) => object.sha256));
  await upsertStoredDownloads(downloadRecordsFor(plan.refs.filter((object) => onPhone.has(object.sha256)), getCatalog()));

  const addedBytes = written.reduce((sum, object) => sum + object.bytes, 0);
  await recordInstalledPack({
    packId: manifest.packId,
    scope: manifest.scope,
    profile: manifest.profile.audio,
    ...(manifest.part ? { part: manifest.part } : {}),
    catalogVersion: manifest.catalogVersion,
    keyId: verify.keyId,
    objects: Object.keys(manifest.objects).length,
    bytes: Object.values(manifest.objects).reduce((sum, bytes) => sum + bytes, 0),
    added: written.length,
    importedAt: now,
  });

  return {
    status: 'imported',
    manifest,
    keyId: verify.keyId,
    added: written.length,
    addedBytes,
    present: plan.present.length,
    unsupported: plan.unsupported + plan.unplaceable,
    failed: failures.length,
    failures,
    ...(catalogApplied ? { catalogApplied } : {}),
  };
}
