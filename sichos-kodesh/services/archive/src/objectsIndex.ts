import type { AudioProfile, CollectionId, ObjectKind, ObjectsIndex } from '@sichos-kodesh/pack-format';
import { OBJECTS_INDEX_SCHEMA_VERSION } from '@sichos-kodesh/pack-format';
import { nowIso } from './db.js';
import { ArchiveStore } from './store.js';

/**
 * objects.json from the store: every object with the first item that
 * refers to it (farbrengens preferred, so the apps' own ids win when a
 * recording is both a farbrengen chapter and a JEM event).
 */
export function exportObjectsIndex(store: ArchiveStore, catalogVersion: string): ObjectsIndex {
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
      collection: row.collection,
      itemId: row.item_id,
    };
  }
  return index;
}
