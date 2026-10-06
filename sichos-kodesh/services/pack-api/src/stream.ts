import type { PackManifest } from '@sichos-kodesh/pack-format';
import { MANIFEST_ENTRY_NAME, OBJECTS_INDEX_ENTRY_NAME, canonicalBytes, crc32, objectEntryName, planStoredZip, zipLocalHeader } from '@sichos-kodesh/pack-format';
import type { ZipLayoutEntry } from '@sichos-kodesh/pack-format';
import type { PublishMeta } from './layout.js';
import { publishKeys } from './layout.js';
import type { PackStore } from './store.js';

/**
 * One pack as a stream, in one pass over the store: the manifest, then
 * objects.json, then every object, each behind a local header written from
 * the sizes and CRCs the publish step recorded. The exact length is known
 * before the first byte, so the response carries Content-Length and the
 * phone (or a browser) shows real progress. The bytes are the ones
 * `sk-pack build` writes for the same manifest.
 *
 * An object that arrives with other than its recorded size errors the
 * stream: a truncated pack must fail, never pass for a whole one.
 */
export interface PackStream {
  body: ReadableStream<Uint8Array>;
  size: number;
}

/** `objectCrc32` holds the CRC-32 of every object the manifest carries (the planned selection's, handler.ts). */
export function streamPack(store: PackStore, manifest: PackManifest, meta: PublishMeta, objectCrc32: Record<string, number>): PackStream {
  const manifestBytes = canonicalBytes(manifest);
  const objects = Object.entries(manifest.objects);
  const entries: ZipLayoutEntry[] = [{ name: MANIFEST_ENTRY_NAME, size: manifestBytes.length, crc32: crc32(manifestBytes) }];
  if (manifest.objectsIndex) entries.push({ name: OBJECTS_INDEX_ENTRY_NAME, size: meta.objectsIndex.bytes, crc32: meta.objectsIndex.crc32 });
  for (const [sha, bytes] of objects) {
    const crc = objectCrc32[sha];
    if (crc === undefined) throw new Error(`no CRC-32 recorded for object ${sha}`);
    entries.push({ name: objectEntryName(sha), size: bytes, crc32: crc });
  }
  const plan = planStoredZip(entries);
  const sources: Array<{ entry: ZipLayoutEntry; key: string | null }> = entries.map((entry, i) => ({
    entry,
    key: i === 0 ? null : entry.name === OBJECTS_INDEX_ENTRY_NAME ? publishKeys.objectsIndex : publishKeys.object(entry.name.slice('objects/'.length)),
  }));

  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index > sources.length) return;
      if (index === sources.length) {
        controller.enqueue(plan.trailer);
        controller.close();
        index += 1;
        return;
      }
      const { entry, key } = sources[index]!;
      index += 1;
      controller.enqueue(zipLocalHeader(entry));
      if (key === null) {
        controller.enqueue(manifestBytes);
        return;
      }
      const object = await store.get(key);
      if (!object) {
        controller.error(new Error(`${key} is missing from the archive`));
        return;
      }
      const reader = object.body.getReader();
      let sent = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sent += value.length;
        if (sent > entry.size) break;
        controller.enqueue(value);
      }
      if (sent !== entry.size) controller.error(new Error(`${key} has ${sent} bytes, not the ${entry.size} published`));
    },
  });
  return { body, size: plan.totalBytes };
}
