import type { AudioProfile, CollectionId, ObjectKind, ObjectsIndex } from '@sichos-kodesh/pack-format';
import { OBJECTS_INDEX_SCHEMA_VERSION } from '@sichos-kodesh/pack-format';
import { nowIso } from './db.js';
import { ArchiveStore } from './store.js';

/**
 * Every name upstream serves exactly an object's bytes under, by object:
 * the source ids of its current refs (the crawler hashed each name's own
 * download, so a shared hash is the same bytes). A name whose current refs
 * point at two different objects is not the same bytes and is never an
 * alias of either; it is returned as `ambiguous`.
 */
export function namesByObject(store: ArchiveStore): { names: Map<string, string[]>; ambiguous: string[] } {
  const rows = store.db.prepare('SELECT DISTINCT sha256, source_id FROM refs WHERE removed_commit IS NULL ORDER BY source_id').all() as Array<{ sha256: string; source_id: string }>;
  const shasOf = new Map<string, Set<string>>();
  for (const row of rows) shasOf.set(row.source_id, (shasOf.get(row.source_id) ?? new Set()).add(row.sha256));
  const names = new Map<string, string[]>();
  const ambiguous: string[] = [];
  for (const [name, shas] of shasOf) {
    if (shas.size > 1) {
      ambiguous.push(name);
      continue;
    }
    const [sha] = shas;
    names.set(sha!, [...(names.get(sha!) ?? []), name]);
  }
  return { names, ambiguous };
}

/**
 * objects.json from the store: every object with the first item that
 * refers to it (farbrengens preferred, so the apps' own ids win when a
 * recording is both a farbrengen chapter and a JEM event), and every
 * encoded recording under its original's item and upstream id, with its
 * own profile - so `sourceKey(audio, workerFilename, 'opus24')` finds it.
 * An object upstream serves under more names than one lists the others as
 * `aliases`; an encoding lists its original's.
 */
export function exportObjectsIndex(store: ArchiveStore, catalogVersion: string): ObjectsIndex {
  const { names } = namesByObject(store);
  const aliasesOf = (sha: string, sourceId: string) => (names.get(sha) ?? []).filter((name) => name !== sourceId);
  const rows = store.db
    .prepare(
      `SELECT o.sha256, o.kind, o.profile, o.bytes, r.collection, r.item_id, r.source_id
       FROM objects o JOIN refs r ON r.sha256 = o.sha256 AND r.removed_commit IS NULL
       ORDER BY o.sha256, CASE r.collection WHEN 'farbrengens' THEN 0 ELSE 1 END, r.collection, r.item_id`,
    )
    .all() as Array<{ sha256: string; kind: ObjectKind; profile: AudioProfile | null; bytes: number; collection: CollectionId; item_id: string; source_id: string }>;
  const index: ObjectsIndex = { schema: OBJECTS_INDEX_SCHEMA_VERSION, version: catalogVersion, builtAt: nowIso(), objects: {} };
  for (const row of rows) {
    if (index.objects[row.sha256]) continue;
    index.objects[row.sha256] = {
      kind: row.kind,
      ...(row.profile ? { profile: row.profile } : {}),
      bytes: row.bytes,
      sourceId: row.source_id,
      ...(aliasesOf(row.sha256, row.source_id).length > 0 ? { aliases: aliasesOf(row.sha256, row.source_id) } : {}),
      collection: row.collection,
      itemId: row.item_id,
    };
  }
  const derived = store.db
    .prepare(
      `SELECT d.sha256, d.src_sha256, d.profile, d.bytes, r.collection, r.item_id, r.source_id
       FROM derivations d JOIN refs r ON r.sha256 = d.src_sha256 AND r.removed_commit IS NULL
       ORDER BY d.sha256, CASE r.collection WHEN 'farbrengens' THEN 0 ELSE 1 END, r.collection, r.item_id`,
    )
    .all() as Array<{ sha256: string; src_sha256: string; profile: AudioProfile; bytes: number; collection: CollectionId; item_id: string; source_id: string }>;
  for (const row of derived) {
    if (index.objects[row.sha256]) continue;
    const aliases = aliasesOf(row.src_sha256, row.source_id);
    index.objects[row.sha256] = { kind: 'audio', profile: row.profile, bytes: row.bytes, sourceId: row.source_id, ...(aliases.length > 0 ? { aliases } : {}), collection: row.collection, itemId: row.item_id };
  }
  return index;
}
