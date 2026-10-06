import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBlobUtil from 'react-native-blob-util';
import type { AudioProfile, CollectionId, ObjectKind, ObjectsIndex, PackScope } from '@sichos-kodesh/pack-format';
import { isSha256, parseObjectsIndex } from '@sichos-kodesh/pack-format';

/**
 * What the phone holds, by hash. Files stay where the downloader puts them
 * (see placement.ts); this is the index over them: sha256 -> which object
 * and which file. It is what `have.json` lists for the station, and how an
 * import knows it already has a file whatever it was called.
 *
 * Kept as JSON files in the app's own directory, not AsyncStorage: the
 * index can reach tens of thousands of objects, past what one AsyncStorage
 * row holds on Android. Every write goes through one queue, so concurrent
 * imports and syncs never lose each other's records.
 */

export interface HeldObject {
  sha256: string;
  bytes: number;
  kind: ObjectKind;
  profile?: AudioProfile;
  sourceId: string;
  /** Relative to the files directory. */
  file: string;
  collection?: CollectionId;
  itemId?: string;
  /** How it arrived: a signed pack, a shared ZIP or folder, or the phone's own download (hashed later). */
  source: 'pack' | 'shared' | 'download';
  /** False for a shared file recognised only by its name (no trusted hash vouches for it). */
  verified: boolean;
  addedAt: string;
}

/** A pack imported on this phone, for About and Settings > Offline. */
export interface InstalledPack {
  packId: string;
  scope: PackScope;
  profile: AudioProfile;
  part?: { index: number; count: number; setId: string };
  catalogVersion: string;
  keyId: string;
  objects: number;
  bytes: number;
  /** Objects this import wrote; the rest were already on the phone. */
  added: number;
  importedAt: string;
}

const OFFLINE_DIR = 'offline';
const HELD_FILE = `${OFFLINE_DIR}/held-objects.json`;
const INDEX_FILE = `${OFFLINE_DIR}/objects-index.json`;
const PACKS_KEY = 'sichos-kodesh:offline-installed-packs';

export function documentPath(relative: string): string {
  return `${RNBlobUtil.fs.dirs.DocumentDir}/${relative}`;
}

async function readJsonFile(relative: string): Promise<unknown> {
  try {
    const path = documentPath(relative);
    if (!(await RNBlobUtil.fs.exists(path))) return null;
    return JSON.parse(String(await RNBlobUtil.fs.readFile(path, 'utf8')));
  } catch {
    return null;
  }
}

/** Written to a `.part` path and moved into place, so a crash never leaves half a file. */
async function writeJsonFile(relative: string, value: unknown): Promise<void> {
  const path = documentPath(relative);
  const dir = documentPath(OFFLINE_DIR);
  if (!(await RNBlobUtil.fs.exists(dir))) await RNBlobUtil.fs.mkdir(dir);
  const temp = `${path}.part`;
  await RNBlobUtil.fs.writeFile(temp, JSON.stringify(value), 'utf8');
  if (await RNBlobUtil.fs.exists(path)) await RNBlobUtil.fs.unlink(path);
  await RNBlobUtil.fs.mv(temp, path);
}

function isHeldObject(value: unknown): value is HeldObject {
  const v = value as HeldObject;
  return !!v && typeof v === 'object' && isSha256(v.sha256) && typeof v.file === 'string' && typeof v.sourceId === 'string' && typeof v.bytes === 'number';
}

let held: Record<string, HeldObject> | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Runs `task` after every earlier store task, so read-modify-write cycles never interleave. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function loadHeld(): Promise<Record<string, HeldObject>> {
  if (held) return held;
  const raw = await readJsonFile(HELD_FILE);
  const next: Record<string, HeldObject> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [sha, value] of Object.entries(raw as Record<string, unknown>)) {
      if (isHeldObject(value) && value.sha256 === sha) next[sha] = value;
    }
  }
  held = next;
  return held;
}

export function readHeldObjects(): Promise<Record<string, HeldObject>> {
  return serial(async () => ({ ...(await loadHeld()) }));
}

/** Adds (or replaces) records. A file holds one object, so an older record for the same file is dropped. */
export function recordHeldObjects(objects: HeldObject[]): Promise<void> {
  if (objects.length === 0) return Promise.resolve();
  return serial(async () => {
    const current = await loadHeld();
    const files = new Set(objects.map((object) => object.file));
    const next: Record<string, HeldObject> = {};
    for (const [sha, object] of Object.entries(current)) if (!files.has(object.file)) next[sha] = object;
    for (const object of objects) next[object.sha256] = object;
    held = next;
    await writeJsonFile(HELD_FILE, next);
  });
}

/** Drops records whose file is gone (deleted from Settings, auto-cleanup, cleared storage). */
export function reconcileHeldObjects(): Promise<Record<string, HeldObject>> {
  return serial(async () => {
    const current = await loadHeld();
    const next: Record<string, HeldObject> = {};
    let changed = false;
    for (const [sha, object] of Object.entries(current)) {
      let exists = false;
      try {
        exists = await RNBlobUtil.fs.exists(documentPath(object.file));
      } catch {
        exists = false;
      }
      if (exists) next[sha] = object;
      else changed = true;
    }
    held = next;
    if (changed) await writeJsonFile(HELD_FILE, next);
    return { ...next };
  });
}

/**
 * The objects index this phone trusts: only ever one that arrived inside a
 * signed pack (its sha256 is stamped in the signed manifest). A shared
 * ZIP's own objects.json is never read. Indexes from several packs are
 * merged; for the same hash the newer index wins.
 */
export async function readTrustedObjectsIndex(): Promise<ObjectsIndex | null> {
  return parseObjectsIndex(await readJsonFile(INDEX_FILE));
}

export function mergeObjectsIndexes(current: ObjectsIndex | null, incoming: ObjectsIndex): ObjectsIndex {
  if (!current) return incoming;
  const incomingIsNewer = Date.parse(incoming.builtAt) >= Date.parse(current.builtAt);
  const [older, newer] = incomingIsNewer ? [current, incoming] : [incoming, current];
  return { schema: newer.schema, version: newer.version, builtAt: newer.builtAt, objects: { ...older.objects, ...newer.objects } };
}

export function storeTrustedObjectsIndex(incoming: ObjectsIndex): Promise<void> {
  return serial(async () => {
    const merged = mergeObjectsIndexes(await readTrustedObjectsIndex(), incoming);
    await writeJsonFile(INDEX_FILE, merged);
  });
}

function isInstalledPack(value: unknown): value is InstalledPack {
  const v = value as InstalledPack;
  return !!v && typeof v === 'object' && typeof v.packId === 'string' && !!v.scope && typeof v.importedAt === 'string';
}

export async function readInstalledPacks(): Promise<InstalledPack[]> {
  try {
    const raw = await AsyncStorage.getItem(PACKS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter(isInstalledPack) : [];
  } catch {
    return [];
  }
}

/** Newest first; importing the same pack again replaces its line. */
export async function recordInstalledPack(pack: InstalledPack): Promise<void> {
  const packs = await readInstalledPacks();
  const next = [pack, ...packs.filter((p) => p.packId !== pack.packId)];
  try {
    await AsyncStorage.setItem(PACKS_KEY, JSON.stringify(next));
  } catch {
    // Best-effort: the files are in place either way.
  }
}

/** For tests: forget the in-memory copy so the next read goes to disk. */
export function resetObjectStoreCache(): void {
  held = null;
  queue = Promise.resolve();
}
