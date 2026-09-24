/**
 * The .skpack manifest - the contract between everything that makes packs
 * (services/pack-builder, the download site, the station, the app's own
 * export) and everything that reads them (the phone, the web app, the
 * station). See README.md for the file layout of a pack.
 *
 * Entries are keyed by the ids the apps already use: a farbrengen is
 * (`hebrewYear`, `occasionId`), a recording is its JEM `workerFilename`, a
 * hanacha is its Drive `driveFileId`. Other collections (Likkutei Sichos,
 * maamorim, igros, ...) use their own stable ids in the same fields, so a
 * pack maps onto the catalog without a lookup table.
 */

export const PACK_SCHEMA_VERSION = 1 as const;
export const PACK_EXTENSION = '.skpack';
export const MANIFEST_ENTRY_NAME = 'manifest.json';
export const CATALOG_ENTRY_NAME = 'catalog.json';
export const OBJECTS_INDEX_ENTRY_NAME = 'objects.json';
export const OBJECTS_DIR = 'objects/';

/** Which bytes of a recording an object holds. `src` is the upstream MP3 untouched. */
export type AudioProfile = 'src' | 'opus16' | 'opus24' | 'opus32' | 'mp3-32';
export const AUDIO_PROFILES: readonly AudioProfile[] = ['src', 'opus16', 'opus24', 'opus32', 'mp3-32'];

/** `search`: a work's full-text search index, an SQLite FTS4 database (text.ts). */
export type ObjectKind = 'audio' | 'pdf' | 'text' | 'search';
export const OBJECT_KINDS: readonly ObjectKind[] = ['audio', 'pdf', 'text', 'search'];

/**
 * The collections of the library. `farbrengens` is today's catalog; the
 * next ones arrived with catalog schema 2. `works` (schema 3) holds the
 * seforim's texts: an entry per unit, `<work id>/<unit id>`, and one per
 * work for its search index.
 */
export type CollectionId =
  | 'farbrengens'
  | 'likkuteiSichos'
  | 'maamorim'
  | 'igros'
  | 'maanos'
  | 'reshimos'
  | 'yomanim'
  | 'michtavimKlolim'
  | 'hadranim'
  | 'jemEvents'
  | 'works';
export const COLLECTION_IDS: readonly CollectionId[] = [
  'farbrengens',
  'likkuteiSichos',
  'maamorim',
  'igros',
  'maanos',
  'reshimos',
  'yomanim',
  'michtavimKlolim',
  'hadranim',
  'jemEvents',
  'works',
];

/** One stored file, as an item refers to it. */
export interface ObjectRef {
  sha256: string;
  bytes: number;
  kind: ObjectKind;
  /** Audio only. */
  profile?: AudioProfile;
  /** The upstream id the apps use: JEM `workerFilename`, Drive `driveFileId`, or a text id. */
  sourceId: string;
  /** PDF section (`mugah`, `biltiMugah`, ...), audio chapter index as a string, or a text role. */
  role?: string;
  label?: string;
  durationMs?: number;
}

export interface PackEntry {
  collection: CollectionId;
  /** Farbrengens: the mafteiach occasion id as a string. */
  itemId: string;
  hebrewYear?: number;
  hebrewDate?: string;
  label?: string;
  refs: ObjectRef[];
}

export type PackScopeKind = 'month' | 'year' | 'occasions' | 'volume' | 'custom' | 'work';

export interface PackScope {
  kind: PackScopeKind;
  collection: CollectionId;
  hebrewYear?: number;
  /** mafteiach month token, `01`..`12`, `06A`/`06B` in a leap year. */
  month?: string;
  volume?: number;
  /** `work` scopes: the work id (catalog schema 3). */
  work?: string;
  label: { en: string; he: string };
}

export interface PackSignature {
  alg: 'ed25519';
  keyId: string;
  /** base64 of the 64-byte detached signature over `manifestSigningBytes(manifest)`. */
  sig: string;
}

export interface PackManifest {
  schema: typeof PACK_SCHEMA_VERSION;
  /** Stable for a selection: sha256 of the sorted object list plus the scope. */
  packId: string;
  builtAt: string;
  catalogVersion: string;
  profile: { audio: AudioProfile; encoder?: string };
  scope: PackScope;
  entries: PackEntry[];
  /** sha256 -> bytes for every object in this pack (this part, when split). */
  objects: Record<string, number>;
  part?: { index: number; count: number; setId: string };
  /** Present when the pack carries catalog.json. */
  catalog?: { version: string; sha256: string };
  /** Present when the pack carries objects.json. */
  objectsIndex?: { version: string; sha256: string };
  signature?: PackSignature;
}

const SHA256_RE = /^[0-9a-f]{64}$/;

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_RE.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function parseObjectRef(value: unknown): ObjectRef | null {
  if (!isRecord(value)) return null;
  const { sha256, bytes, kind, profile, sourceId, role, label, durationMs } = value;
  if (!isSha256(sha256) || !isNonNegativeInt(bytes)) return null;
  if (typeof kind !== 'string' || !(OBJECT_KINDS as readonly string[]).includes(kind)) return null;
  if (profile !== undefined && (typeof profile !== 'string' || !(AUDIO_PROFILES as readonly string[]).includes(profile))) return null;
  if (typeof sourceId !== 'string' || sourceId.length === 0) return null;
  if (role !== undefined && typeof role !== 'string') return null;
  if (label !== undefined && typeof label !== 'string') return null;
  if (durationMs !== undefined && !isNonNegativeInt(durationMs)) return null;
  const ref: ObjectRef = { sha256, bytes, kind: kind as ObjectKind, sourceId };
  if (profile !== undefined) ref.profile = profile as AudioProfile;
  if (role !== undefined) ref.role = role;
  if (label !== undefined) ref.label = label;
  if (durationMs !== undefined) ref.durationMs = durationMs;
  return ref;
}

export function parsePackEntry(value: unknown): PackEntry | null {
  if (!isRecord(value)) return null;
  const { collection, itemId, hebrewYear, hebrewDate, label, refs } = value;
  if (typeof collection !== 'string' || !(COLLECTION_IDS as readonly string[]).includes(collection)) return null;
  if (typeof itemId !== 'string' || itemId.length === 0) return null;
  if (hebrewYear !== undefined && !isNonNegativeInt(hebrewYear)) return null;
  if (hebrewDate !== undefined && typeof hebrewDate !== 'string') return null;
  if (label !== undefined && typeof label !== 'string') return null;
  if (!Array.isArray(refs)) return null;
  const parsedRefs: ObjectRef[] = [];
  for (const ref of refs) {
    const parsed = parseObjectRef(ref);
    if (!parsed) return null;
    parsedRefs.push(parsed);
  }
  const entry: PackEntry = { collection: collection as CollectionId, itemId, refs: parsedRefs };
  if (hebrewYear !== undefined) entry.hebrewYear = hebrewYear;
  if (hebrewDate !== undefined) entry.hebrewDate = hebrewDate;
  if (label !== undefined) entry.label = label;
  return entry;
}

function parseScope(value: unknown): PackScope | null {
  if (!isRecord(value)) return null;
  const { kind, collection, hebrewYear, month, volume, work, label } = value;
  if (typeof kind !== 'string' || !['month', 'year', 'occasions', 'volume', 'custom', 'work'].includes(kind)) return null;
  if (typeof collection !== 'string' || !(COLLECTION_IDS as readonly string[]).includes(collection)) return null;
  if (!isRecord(label) || typeof label.en !== 'string' || typeof label.he !== 'string') return null;
  if (hebrewYear !== undefined && !isNonNegativeInt(hebrewYear)) return null;
  if (month !== undefined && typeof month !== 'string') return null;
  if (volume !== undefined && !isNonNegativeInt(volume)) return null;
  if (work !== undefined && typeof work !== 'string') return null;
  const scope: PackScope = { kind: kind as PackScopeKind, collection: collection as CollectionId, label: { en: label.en, he: label.he } };
  if (hebrewYear !== undefined) scope.hebrewYear = hebrewYear;
  if (month !== undefined) scope.month = month;
  if (volume !== undefined) scope.volume = volume;
  if (work !== undefined) scope.work = work;
  return scope;
}

function parseSignature(value: unknown): PackSignature | null {
  if (!isRecord(value)) return null;
  if (value.alg !== 'ed25519' || typeof value.keyId !== 'string' || typeof value.sig !== 'string') return null;
  return { alg: 'ed25519', keyId: value.keyId, sig: value.sig };
}

function parseFileStamp(value: unknown): { version: string; sha256: string } | null {
  if (!isRecord(value) || typeof value.version !== 'string' || !isSha256(value.sha256)) return null;
  return { version: value.version, sha256: value.sha256 };
}

/**
 * Validates a decoded manifest.json. Returns null for anything the
 * readers cannot trust: a wrong schema, an object that is not a sha256,
 * an entry that refers to an object the manifest does not list. Never
 * throws, so a truncated or foreign file is just "not a pack".
 */
export function parsePackManifest(value: unknown): PackManifest | null {
  if (!isRecord(value)) return null;
  if (value.schema !== PACK_SCHEMA_VERSION) return null;
  const { packId, builtAt, catalogVersion, profile, scope, entries, objects, part, catalog, objectsIndex, signature } = value;
  if (typeof packId !== 'string' || packId.length === 0) return null;
  if (typeof builtAt !== 'string' || Number.isNaN(Date.parse(builtAt))) return null;
  if (typeof catalogVersion !== 'string' || catalogVersion.length === 0) return null;
  if (!isRecord(profile) || typeof profile.audio !== 'string' || !(AUDIO_PROFILES as readonly string[]).includes(profile.audio)) return null;
  if (profile.encoder !== undefined && typeof profile.encoder !== 'string') return null;
  const parsedScope = parseScope(scope);
  if (!parsedScope) return null;
  if (!Array.isArray(entries) || !isRecord(objects)) return null;
  const parsedObjects: Record<string, number> = {};
  for (const [sha, bytes] of Object.entries(objects)) {
    if (!isSha256(sha) || !isNonNegativeInt(bytes)) return null;
    parsedObjects[sha] = bytes;
  }
  const parsedEntries: PackEntry[] = [];
  for (const entry of entries) {
    const parsed = parsePackEntry(entry);
    if (!parsed) return null;
    for (const ref of parsed.refs) {
      const listed = parsedObjects[ref.sha256];
      if (listed === undefined || listed !== ref.bytes) return null;
    }
    parsedEntries.push(parsed);
  }
  const manifest: PackManifest = {
    schema: PACK_SCHEMA_VERSION,
    packId,
    builtAt,
    catalogVersion,
    profile: profile.encoder === undefined ? { audio: profile.audio as AudioProfile } : { audio: profile.audio as AudioProfile, encoder: profile.encoder },
    scope: parsedScope,
    entries: parsedEntries,
    objects: parsedObjects,
  };
  if (part !== undefined) {
    if (!isRecord(part) || !isNonNegativeInt(part.index) || !isNonNegativeInt(part.count) || typeof part.setId !== 'string') return null;
    if (part.count < 1 || part.index >= part.count) return null;
    manifest.part = { index: part.index, count: part.count, setId: part.setId };
  }
  if (catalog !== undefined) {
    const stamp = parseFileStamp(catalog);
    if (!stamp) return null;
    manifest.catalog = stamp;
  }
  if (objectsIndex !== undefined) {
    const stamp = parseFileStamp(objectsIndex);
    if (!stamp) return null;
    manifest.objectsIndex = stamp;
  }
  if (signature !== undefined) {
    const parsed = parseSignature(signature);
    if (!parsed) return null;
    manifest.signature = parsed;
  }
  return manifest;
}

/** Total bytes of the objects a manifest lists. */
export function manifestBytes(manifest: Pick<PackManifest, 'objects'>): number {
  let total = 0;
  for (const bytes of Object.values(manifest.objects)) total += bytes;
  return total;
}

/** The zip entry name of an object. */
export function objectEntryName(sha256: string): string {
  return `${OBJECTS_DIR}${sha256}`;
}

/** The sha256 an `objects/<sha256>` entry name denotes, or null for any other entry. */
export function sha256FromEntryName(name: string): string | null {
  if (!name.startsWith(OBJECTS_DIR)) return null;
  const rest = name.slice(OBJECTS_DIR.length);
  return isSha256(rest) ? rest : null;
}

/** The farbrengens collection keys an item by its mafteiach occasion id. */
export function farbrengenItemId(occasionId: number): string {
  return String(occasionId);
}
